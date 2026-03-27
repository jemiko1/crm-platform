import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CoreWebhookGuard } from "./core-webhook.guard";
import { CoreSyncService } from "./core-sync.service";
import { CoreWebhookDto } from "./dto/webhook-event.dto";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("CoreIntegration")
@Controller("v1/integrations/core")
export class CoreIntegrationController {
  private readonly logger = new Logger(CoreIntegrationController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: CoreSyncService,
  ) {}

  // ─── Webhook (authenticated via shared secret) ───

  @Post("webhook")
  @UseGuards(CoreWebhookGuard)
  @Doc({
    summary: "Core system webhook (HMAC / shared secret)",
    ok: "Processing or duplicate acknowledgment",
    noAuth: true,
    bodyType: CoreWebhookDto,
  })
  async handleWebhook(@Body() dto: CoreWebhookDto) {
    const existing = await this.prisma.syncEvent.findUnique({
      where: { eventId: dto.eventId },
    });
    if (existing) {
      this.logger.debug(`Duplicate event ${dto.eventId}, skipping`);
      return { status: "already_processed", eventId: dto.eventId };
    }

    const [entityType] = dto.eventType.split(".");
    const event = await this.prisma.syncEvent.create({
      data: {
        source: "core",
        eventId: dto.eventId,
        entityType,
        entityCoreId: dto.payload.coreId ?? null,
        status: "RECEIVED",
        payload: dto.payload as any,
      },
    });

    try {
      await this.syncService.process(dto.eventType, dto.payload);

      await this.prisma.syncEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      return { status: "processed", eventId: dto.eventId };
    } catch (err: any) {
      this.logger.error(`Event ${dto.eventId} failed: ${err.message}`);

      await this.prisma.syncEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", error: String(err.message).slice(0, 2000) },
      });

      throw new InternalServerErrorException(
        `Sync processing failed: ${err.message}`,
      );
    }
  }

  // ─── Status / diagnostics (JWT-protected) ───

  @Get("status")
  @UseGuards(JwtAuthGuard)
  @Doc({
    summary: "Core sync diagnostics (last 24h)",
    ok: "Event counts and last processed/failed metadata",
  })
  async getStatus() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const counts = await this.prisma.syncEvent.groupBy({
      by: ["status"],
      where: { receivedAt: { gte: since } },
      _count: true,
    });

    const lastProcessed = await this.prisma.syncEvent.findFirst({
      where: { status: "PROCESSED" },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    });

    const lastFailed = await this.prisma.syncEvent.findFirst({
      where: { status: "FAILED" },
      orderBy: { receivedAt: "desc" },
      select: {
        error: true,
        receivedAt: true,
        entityType: true,
        entityCoreId: true,
      },
    });

    return {
      last24h: Object.fromEntries(
        counts.map((c) => [c.status, c._count]),
      ),
      lastProcessedAt: lastProcessed?.processedAt ?? null,
      lastFailedError: lastFailed ?? null,
    };
  }

  @Get("events")
  @UseGuards(JwtAuthGuard)
  @Doc({
    summary: "Recent sync events",
    ok: "Paged sync event rows",
    queries: [
      { name: "status", description: "Filter by event status" },
      { name: "limit", description: "Max rows (1–100)" },
    ],
  })
  async getEvents(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const take = Math.min(Math.max(parseInt(limit ?? "50", 10) || 50, 1), 100);

    return this.prisma.syncEvent.findMany({
      where: status ? { status } : undefined,
      orderBy: { receivedAt: "desc" },
      take,
      select: {
        id: true,
        eventId: true,
        entityType: true,
        entityCoreId: true,
        status: true,
        error: true,
        receivedAt: true,
        processedAt: true,
      },
    });
  }
}
