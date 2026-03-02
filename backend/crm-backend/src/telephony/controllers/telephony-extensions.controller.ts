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
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

class CreateExtensionDto {
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

@Controller('v1/telephony/extensions')
@UseGuards(JwtAuthGuard)
export class TelephonyExtensionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.telephonyExtension.findMany({
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
      orderBy: { extension: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateExtensionDto) {
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
  async remove(@Param('id') id: string) {
    await this.prisma.telephonyExtension.delete({ where: { id } });
    return { ok: true };
  }
}
