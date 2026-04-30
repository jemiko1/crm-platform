import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryCallsDto } from '../dto/query-calls.dto';
import { CallerLookupResult } from '../types/telephony.types';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';
import { IntelligenceService } from '../../client-intelligence/services/intelligence.service';
import { DataScopeService } from '../../common/utils/data-scope';
import { RecordingAccessService } from '../recording/recording-access.service';

@Injectable()
export class TelephonyCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneResolver: PhoneResolverService,
    private readonly intelligenceService: IntelligenceService,
    private readonly dataScope: DataScopeService,
    private readonly recordingAccess: RecordingAccessService,
  ) {}

  async findAll(query: QueryCallsDto, userId: string, isSuperAdmin?: boolean) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CallSessionWhereInput = {
      startAt: {
        gte: new Date(query.from),
        lte: new Date(query.to),
      },
      // B7 — exclude internal ext-to-ext calls from Call Logs by default.
      // Internal transfers / supervisor dials don't belong in the public
      // call log and only inflate counts. A dedicated "Internal calls"
      // view (future open question) would read them separately.
      isInternal: false,
    };

    if (query.queueId) where.queueId = query.queueId;
    if (query.userId) where.assignedUserId = query.userId;
    if (query.disposition) where.disposition = query.disposition;

    if (query.search) {
      where.OR = [
        { callerNumber: { contains: query.search } },
        { calleeNumber: { contains: query.search } },
      ];
    }

    // Scope results by user's call_logs permission scope.
    // CallSession uses `assignedUserId`, not `operatorUserId`, so we build the
    // scope filter manually using the existing DataScopeService.resolve() result.
    const scope = await this.dataScope.resolve(userId, 'call_logs', isSuperAdmin);
    if (scope.scope === 'own') {
      where.assignedUserId = userId;
    } else if (scope.scope === 'department' && scope.departmentId) {
      where.assignedUser = {
        employee: {
          departmentId: scope.departmentId,
          // Include employees whose position level is ≤ the manager's level
          // (prevents upward visibility) OR whose position has no level set.
          // PostgreSQL evaluates NULL <= N as NULL (not TRUE), so a plain
          // `lte` filter silently excludes all null-level subordinates.
          OR: [
            { position: { level: { lte: scope.userLevel } } },
            { position: { level: null } },
          ],
        },
      };
    } else if (scope.scope === 'department_tree' && scope.departmentIds.length > 0) {
      where.assignedUser = {
        employee: {
          departmentId: { in: scope.departmentIds },
          // Same null-level guard as the department branch above.
          OR: [
            { position: { level: { lte: scope.userLevel } } },
            { position: { level: null } },
          ],
        },
      };
    }
    // scope === 'all' → no additional filter

    const [rawData, total] = await Promise.all([
      this.prisma.callSession.findMany({
        where,
        include: {
          callMetrics: true,
          queue: { select: { id: true, name: true } },
          assignedUser: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
          recordings: { select: { id: true, durationSeconds: true, filePath: true, url: true } },
          qualityReview: { select: { id: true, status: true, score: true } },
        },
        orderBy: { startAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.callSession.count({ where }),
    ]);

    // Resolve agent display names from TelephonyExtension
    const agentUserIds = rawData
      .map((s) => s.assignedUserId)
      .filter((id): id is string => id !== null);
    const extensions =
      agentUserIds.length > 0
        ? await this.prisma.telephonyExtension.findMany({
            where: { crmUserId: { in: agentUserIds } },
            select: { crmUserId: true, displayName: true },
          })
        : [];
    const extNameMap = new Map(extensions.map((e) => [e.crmUserId, e.displayName]));

    // Resolve client names from caller numbers
    const callerNumbers = [...new Set(rawData.map((s) => s.callerNumber).filter(Boolean))];
    const clientNameMap = new Map<string, string>();
    if (callerNumbers.length > 0) {
      const clients = await this.prisma.client.findMany({
        where: {
          OR: [
            { primaryPhone: { in: callerNumbers } },
            { secondaryPhone: { in: callerNumbers } },
          ],
        },
        select: { firstName: true, lastName: true, primaryPhone: true, secondaryPhone: true },
      });
      for (const c of clients) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        if (name) {
          if (c.primaryPhone) clientNameMap.set(c.primaryPhone, name);
          if (c.secondaryPhone) clientNameMap.set(c.secondaryPhone, name);
        }
      }
    }

    const totalPages = Math.ceil(total / pageSize);

    const data = rawData.map((s) => {
      const agentName =
        extNameMap.get(s.assignedUserId ?? '') ??
        (s.assignedUser?.employee
          ? [s.assignedUser.employee.firstName, s.assignedUser.employee.lastName]
              .filter(Boolean)
              .join(' ')
          : null) ??
        s.assignedUser?.email ??
        null;

      return {
        id: s.id,
        linkedId: s.linkedId,
        direction: s.direction,
        callerNumber: s.callerNumber,
        calleeNumber: s.calleeNumber,
        queueId: s.queue?.id ?? null,
        queueName: s.queue?.name ?? null,
        disposition: s.disposition,
        startAt: s.startAt.toISOString(),
        answerAt: s.answerAt?.toISOString() ?? null,
        endAt: s.endAt?.toISOString() ?? null,
        durationSec: s.callMetrics
          ? s.callMetrics.talkSeconds + s.callMetrics.holdSeconds
          : null,
        talkTimeSec: s.callMetrics?.talkSeconds ?? null,
        waitTimeSec: s.callMetrics?.waitSeconds ?? null,
        holdTimeSec: s.callMetrics?.holdSeconds ?? null,
        agentExtension: s.assignedExtension ?? null,
        agentName,
        clientName: clientNameMap.get(s.callerNumber) ?? null,
        recordingUrl: s.recordings.length > 0 ? `/v1/telephony/recordings/${s.recordings[0].id}/audio` : null,
        recordingId: s.recordings[0]?.id ?? null,
        // Is the file already cached on local disk? If not, the frontend shows
        // a "Request Recording" button that triggers a SCP fetch from Asterisk.
        recordingAvailable: s.recordings[0]
          ? this.recordingAccess.isCachedLocally(s.recordings[0])
          : false,
        qualityScore: s.qualityReview?.score ?? null,
      };
    });

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    };
  }

  async lookupPhone(phone: string): Promise<CallerLookupResult> {
    const normalized = this.phoneResolver.localDigits(phone);

    // Always attempt an exact-extension employee match first. Extensions are
    // 3–4 digits, so searching clients with a <7-digit substring produces
    // false positives (e.g. "214" would match any phone number containing
    // "214"). For short inputs, only search employees by extension.
    const extensionMatch = await this.prisma.telephonyExtension.findUnique({
      where: { extension: normalized },
      select: {
        id: true,
        extension: true,
        displayName: true,
        user: { select: { email: true } },
      },
    });

    const employee = extensionMatch
      ? {
          id: extensionMatch.id,
          extension: extensionMatch.extension,
          displayName: extensionMatch.displayName,
          email: extensionMatch.user?.email ?? null,
        }
      : undefined;

    // Short-digit guard: inputs normalized to fewer than 7 digits are almost
    // certainly internal extensions or garbage. Never run a client `contains`
    // query with such a short pattern — it creates false positives.
    if (normalized.length < 7) {
      return {
        employee,
        openWorkOrders: [],
        openIncidents: [],
        recentIncidents: [],
        recentCalls: [],
      };
    }

    const client = await this.prisma.client.findFirst({
      where: {
        isActive: true,
        OR: [
          { primaryPhone: { contains: normalized } },
          { secondaryPhone: { contains: normalized } },
        ],
      },
      include: {
        clientBuildings: {
          include: {
            building: { select: { id: true, name: true, coreId: true } },
          },
        },
      },
    });

    // Search leads by primary phone
    const lead = await this.prisma.lead.findFirst({
      where: {
        primaryPhone: { contains: normalized },
        status: 'ACTIVE',
      },
      include: {
        stage: { select: { name: true } },
        responsibleEmployee: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Open work orders for matched client's buildings
    let openWorkOrders: CallerLookupResult['openWorkOrders'] = [];
    if (client) {
      const buildingIds = client.clientBuildings.map((cb) => cb.building.id);
      if (buildingIds.length > 0) {
        const workOrders = await this.prisma.workOrder.findMany({
          where: {
            buildingId: { in: buildingIds },
            status: { in: ['CREATED', 'LINKED_TO_GROUP', 'IN_PROGRESS'] },
          },
          select: {
            id: true,
            workOrderNumber: true,
            title: true,
            status: true,
            type: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        openWorkOrders = workOrders;
      }
    }

    // Incidents for matched client
    let openIncidents: CallerLookupResult['openIncidents'] = [];
    let recentIncidents: CallerLookupResult['recentIncidents'] = [];
    if (client) {
      const incidentSelect = {
        id: true,
        incidentNumber: true,
        status: true,
        priority: true,
        incidentType: true,
        description: true,
        createdAt: true,
        building: { select: { name: true } },
      } as const;

      const [openRaw, closedRaw] = await Promise.all([
        this.prisma.incident.findMany({
          where: {
            clientId: client.id,
            status: { in: ['CREATED', 'IN_PROGRESS'] },
          },
          select: incidentSelect,
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.incident.findMany({
          where: {
            clientId: client.id,
            status: { in: ['COMPLETED', 'WORK_ORDER_INITIATED'] },
          },
          select: incidentSelect,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      openIncidents = openRaw.map((i) => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        description: i.description,
        buildingName: i.building.name,
        createdAt: i.createdAt,
      }));

      recentIncidents = closedRaw.map((i) => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        description: i.description,
        buildingName: i.building.name,
        createdAt: i.createdAt,
      }));
    }

    // Recent calls from this number
    const recentCallSessions = await this.prisma.callSession.findMany({
      where: { callerNumber: { contains: normalized } },
      select: {
        id: true,
        direction: true,
        startAt: true,
        disposition: true,
        callMetrics: { select: { talkSeconds: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 5,
    });

    let intelligence: CallerLookupResult['intelligence'];
    if (client?.coreId) {
      try {
        const profile = await this.intelligenceService.getProfile(client.coreId, 180);
        intelligence = {
          labels: profile.labels,
          summary: profile.summary,
        };
      } catch {
        // non-critical, skip if intelligence fails
      }
    }

    return {
      employee,
      client: client
        ? {
            id: client.id,
            coreId: client.coreId,
            name: [client.firstName, client.lastName].filter(Boolean).join(' '),
            firstName: client.firstName,
            lastName: client.lastName,
            idNumber: client.idNumber,
            paymentId: client.paymentId,
            primaryPhone: client.primaryPhone,
            secondaryPhone: client.secondaryPhone,
            buildings: client.clientBuildings.map((cb) => cb.building),
          }
        : undefined,
      lead: lead
        ? {
            id: lead.id,
            leadNumber: lead.leadNumber,
            stageName: lead.stage.name,
            responsibleEmployee: lead.responsibleEmployee
              ? `${lead.responsibleEmployee.firstName} ${lead.responsibleEmployee.lastName}`
              : null,
          }
        : undefined,
      openWorkOrders,
      openIncidents,
      recentIncidents,
      intelligence,
      recentCalls: recentCallSessions.map((s) => ({
        id: s.id,
        direction: s.direction,
        startAt: s.startAt,
        disposition: s.disposition,
        durationSec: s.callMetrics?.talkSeconds ?? null,
      })),
    };
  }

  async getExtensionHistory(extension: string) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const telExt = await this.prisma.telephonyExtension.findUnique({
      where: { extension },
      select: { crmUserId: true },
    });

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: threeDaysAgo },
        OR: [
          { assignedExtension: extension },
          ...(telExt?.crmUserId ? [{ assignedUserId: telExt.crmUserId }] : []),
          { callerNumber: { endsWith: extension } },
          { calleeNumber: { endsWith: extension } },
        ],
      },
      select: {
        id: true,
        direction: true,
        callerNumber: true,
        calleeNumber: true,
        assignedExtension: true,
        startAt: true,
        answerAt: true,
        endAt: true,
        disposition: true,
        callMetrics: { select: { talkSeconds: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 100,
    });

    // Collect remote numbers per session and normalize each unique value
    // to its local-digits form. Phone strings in CDR rows can appear as
    // `995555123456`, `+995555123456`, or `0555123456` while clients may be
    // stored in any of those shapes. Match by the normalized form using the
    // same `contains` strategy used by the per-call popup (lookupPhone).
    const remoteNumbers = new Set<string>();
    for (const s of sessions) {
      const remote = s.direction === 'IN' ? s.callerNumber : (s.calleeNumber ?? '');
      if (remote) remoteNumbers.add(remote);
    }

    // Map normalized (local-digits) → client display name. Skip anything
    // shorter than 7 digits to avoid false-positive substring matches
    // (same guard used in lookupPhone).
    const nameByNormalized = new Map<string, string>();
    const rawToNormalized = new Map<string, string>();
    for (const raw of remoteNumbers) {
      const local = this.phoneResolver.localDigits(raw);
      rawToNormalized.set(raw, local);
    }

    const normalizedCandidates = [...new Set([...rawToNormalized.values()])].filter(
      (n) => n.length >= 7,
    );

    if (normalizedCandidates.length > 0) {
      // Single batched query: OR over every normalized candidate. Returns
      // all clients whose phone contains any candidate substring; we then
      // reverse-map each client back to the candidate(s) it matched.
      const clients = await this.prisma.client.findMany({
        where: {
          OR: normalizedCandidates.flatMap((local) => [
            { primaryPhone: { contains: local } },
            { secondaryPhone: { contains: local } },
          ]),
        },
        select: { firstName: true, lastName: true, primaryPhone: true, secondaryPhone: true },
      });
      for (const c of clients) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        if (!name) continue;
        for (const local of normalizedCandidates) {
          if (nameByNormalized.has(local)) continue;
          if (
            (c.primaryPhone && c.primaryPhone.includes(local)) ||
            (c.secondaryPhone && c.secondaryPhone.includes(local))
          ) {
            nameByNormalized.set(local, name);
          }
        }
      }
    }

    return sessions.map((s) => {
      const remote = s.direction === 'IN' ? s.callerNumber : (s.calleeNumber ?? '');
      const normalized = remote ? rawToNormalized.get(remote) : undefined;
      const remoteName = normalized ? (nameByNormalized.get(normalized) ?? null) : null;
      return {
        id: s.id,
        direction: s.direction,
        callerNumber: s.callerNumber,
        calleeNumber: s.calleeNumber,
        remoteName,
        startAt: s.startAt,
        answerAt: s.answerAt,
        endAt: s.endAt,
        disposition: s.disposition,
        durationSec: s.callMetrics?.talkSeconds ?? null,
      };
    });
  }

}
