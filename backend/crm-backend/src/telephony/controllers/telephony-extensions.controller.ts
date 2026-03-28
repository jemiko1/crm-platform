import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

class UpsertExtensionDto {
  @IsString() crmUserId!: string;
  @IsString() extension!: string;
  @IsString() displayName!: string;
  @IsString() @IsOptional() sipServer?: string;
  @IsString() @IsOptional() sipPassword?: string;
  @IsBoolean() @IsOptional() isOperator?: boolean;
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
  constructor(private readonly prisma: PrismaService) {}

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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({ summary: 'List telephony extensions', ok: 'Extensions with user info', permission: true })
  async list() {
    return this.prisma.telephonyExtension.findMany({
      include: {
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

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Create or update extension for CRM user',
    ok: 'Upserted extension row',
    status: 201,
    bodyType: UpsertExtensionDto,
    permission: true,
  })
  async upsert(@Body() dto: UpsertExtensionDto) {
    const existing = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: dto.crmUserId },
    });

    if (existing) {
      return this.prisma.telephonyExtension.update({
        where: { id: existing.id },
        data: {
          extension: dto.extension,
          displayName: dto.displayName,
          sipServer: dto.sipServer ?? null,
          sipPassword: dto.sipPassword ?? null,
          isOperator: dto.isOperator ?? true,
        },
      });
    }

    return this.prisma.telephonyExtension.create({
      data: {
        crmUserId: dto.crmUserId,
        extension: dto.extension,
        displayName: dto.displayName,
        sipServer: dto.sipServer ?? null,
        sipPassword: dto.sipPassword ?? null,
        isOperator: dto.isOperator ?? true,
      },
    });
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
