import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

/**
 * Read-only list of TelephonyQueue rows for admin UIs (Position-Queue rules
 * matrix, future Link/Unlink extension flow).
 *
 * This controller intentionally exposes no write endpoints. Queues are
 * synced from Asterisk by `asterisk-sync.service` every 5 minutes and are
 * not directly editable from CRM (Silent Override Risk #18: the
 * `isAfterHoursQueue` flag is sticky — env-var bootstraps on CREATE only,
 * DB is authoritative after that). If/when an admin needs to toggle
 * `isAfterHoursQueue`, that gets its own explicit endpoint with guardrails.
 */
@ApiTags('Telephony')
@Controller('v1/telephony/queues')
@UseGuards(JwtAuthGuard)
export class TelephonyQueuesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'List telephony queues (id, name, isAfterHoursQueue, isActive)',
    ok: 'Array of queues ordered by name',
    permission: true,
  })
  async list() {
    const queues = await this.prisma.telephonyQueue.findMany({
      select: {
        id: true,
        name: true,
        strategy: true,
        isAfterHoursQueue: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
    return queues;
  }
}
