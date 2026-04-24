import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AsteriskSyncService } from '../sync/asterisk-sync.service';
import { ExtensionLinkService } from '../services/extension-link.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

class LinkExtensionDto {
  @IsUUID() userId!: string;
}

class UpdateExtensionDto {
  @IsString() @IsOptional() extension?: string;
  @IsString() @IsOptional() displayName?: string;
  @IsString() @IsOptional() sipServer?: string;
  @IsString() @IsOptional() sipPassword?: string;
  @IsBoolean() @IsOptional() isOperator?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

@ApiTags('Telephony')
@Controller('v1/telephony/extensions')
@UseGuards(JwtAuthGuard)
export class TelephonyExtensionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asteriskSync: AsteriskSyncService,
    private readonly linkService: ExtensionLinkService,
  ) {}

  @Post('sync-now')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Trigger immediate extension sync from Asterisk',
    ok: 'Sync result with auto-link count and SIP statuses',
    permission: true,
  })
  async syncNow() {
    return this.asteriskSync.syncNow();
  }

  @Get('sip-statuses')
  @Header('Cache-Control', 'no-store')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Get live SIP registration statuses from Asterisk',
    ok: 'Map of extension number to device state',
    permission: true,
  })
  async sipStatuses() {
    return this.asteriskSync.getEndpointStatuses();
  }

  @Get('users-with-config')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Active users with optional telephony extension',
    ok: 'Users joined with extension fields (no SIP passwords)',
    permission: true,
  })
  async usersWithConfig() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        employee: {
          select: { firstName: true, lastName: true, status: true },
        },
        telephonyExtension: {
          select: {
            id: true,
            extension: true,
            displayName: true,
            sipServer: true,
            isOperator: true,
            isActive: true,
          },
        },
      },
      orderBy: { email: 'asc' },
    });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({ summary: 'List telephony extensions', ok: 'Extensions with user info', permission: true })
  async list() {
    return this.prisma.telephonyExtension.findMany({
      select: {
        id: true,
        extension: true,
        displayName: true,
        sipServer: true,
        isOperator: true,
        isActive: true,
        crmUserId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { extension: 'asc' },
    });
  }

  @Post(':id/link')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Link an employee to a pool extension',
    ok: 'Link applied; AMI QueueAdd emitted per PositionQueueRule',
    notFound: true,
    bodyType: LinkExtensionDto,
    params: [{ name: 'id', description: 'Extension UUID' }],
    permission: true,
  })
  async link(@Param('id') id: string, @Body() dto: LinkExtensionDto) {
    await this.linkService.link(id, dto.userId);
    return { ok: true };
  }

  @Post(':id/unlink')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Unlink the employee currently on an extension (returns extension to pool)',
    ok: 'Unlink applied; AMI QueueRemove emitted per PositionQueueRule',
    notFound: true,
    params: [{ name: 'id', description: 'Extension UUID' }],
    permission: true,
  })
  async unlink(@Param('id') id: string) {
    await this.linkService.unlink(id);
    return { ok: true };
  }

  @Post(':id/resync-queues')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Re-apply queue membership for a linked extension (idempotent)',
    ok: 'Applied count + skipped queue names',
    notFound: true,
    params: [{ name: 'id', description: 'Extension UUID' }],
    permission: true,
  })
  async resyncQueues(@Param('id') id: string) {
    return this.linkService.resyncQueues(id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Patch telephony extension',
    ok: 'Updated extension',
    notFound: true,
    bodyType: UpdateExtensionDto,
    params: [{ name: 'id', description: 'Extension UUID' }],
    permission: true,
  })
  async update(@Param('id') id: string, @Body() dto: UpdateExtensionDto) {
    const data: Record<string, any> = {};
    if (dto.extension !== undefined) data.extension = dto.extension;
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.sipServer !== undefined) data.sipServer = dto.sipServer;
    if (dto.sipPassword !== undefined) data.sipPassword = dto.sipPassword;
    if (dto.isOperator !== undefined) data.isOperator = dto.isOperator;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.telephonyExtension.update({ where: { id }, data });
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Delete telephony extension',
    ok: '{ ok: true }',
    notFound: true,
    params: [{ name: 'id', description: 'Extension UUID' }],
    permission: true,
  })
  async remove(@Param('id') id: string) {
    await this.prisma.telephonyExtension.delete({ where: { id } });
    return { ok: true };
  }
}
