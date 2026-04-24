import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

class CreateRuleDto {
  @IsString() positionId!: string;
  @IsString() queueId!: string;
}

/**
 * Manage Position → TelephonyQueue rules.
 *
 * A rule means: "operators whose Position is P should be members of Queue Q".
 * The extension link/unlink flow consults this table to decide which AMI
 * `QueueAdd` / `QueueRemove` actions to emit when an employee is linked to
 * or unlinked from an extension. This replaces the previous hardcoded
 * "Call Center Operator" position check — any Position can be mapped to
 * any set of Queues from the admin UI.
 *
 * Gated behind `telephony.manage` (same permission as the rest of the
 * telephony admin surface — Positions and Queues together form the admin's
 * telephony configuration).
 */
@ApiTags('Telephony')
@Controller('v1/telephony/position-queue-rules')
@UseGuards(JwtAuthGuard)
export class PositionQueueRulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'List all Position → Queue rules with joined position + queue details',
    ok: 'Array of rules; each includes positionName, queueName for the matrix UI',
    permission: true,
  })
  async list() {
    const rules = await this.prisma.positionQueueRule.findMany({
      include: {
        position: { select: { id: true, name: true, nameKa: true, code: true } },
        queue: { select: { id: true, name: true, isAfterHoursQueue: true } },
      },
      orderBy: [{ position: { name: 'asc' } }, { queue: { name: 'asc' } }],
    });
    return rules.map((r) => ({
      id: r.id,
      positionId: r.positionId,
      queueId: r.queueId,
      positionName: r.position.name,
      positionNameKa: r.position.nameKa,
      positionCode: r.position.code,
      queueName: r.queue.name,
      isAfterHoursQueue: r.queue.isAfterHoursQueue,
      createdAt: r.createdAt,
    }));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Create a Position → Queue rule',
    ok: 'Created rule row',
    status: 201,
    bodyType: CreateRuleDto,
    permission: true,
  })
  async create(@Body() dto: CreateRuleDto) {
    // Use upsert so re-clicking the same checkbox in a double-click race
    // returns the existing row instead of raising P2002 on the compound
    // unique. Admin UX: idempotent toggle.
    return this.prisma.positionQueueRule.upsert({
      where: {
        positionId_queueId: {
          positionId: dto.positionId,
          queueId: dto.queueId,
        },
      },
      update: {},
      create: { positionId: dto.positionId, queueId: dto.queueId },
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Delete a Position → Queue rule',
    ok: 'Rule removed; no body returned',
    status: 204,
    notFound: true,
    params: [{ name: 'id', description: 'PositionQueueRule UUID' }],
    permission: true,
  })
  async remove(@Param('id') id: string) {
    // deleteMany (not delete) so clicking an already-removed row is a
    // no-op rather than a 404 — again, idempotent for the matrix UI.
    await this.prisma.positionQueueRule.deleteMany({ where: { id } });
  }
}
