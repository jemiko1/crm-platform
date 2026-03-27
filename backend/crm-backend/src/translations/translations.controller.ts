import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TranslationsService } from './translations.service';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Translations')
@Controller('v1/translations')
@UseGuards(JwtAuthGuard)
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  @Get()
  @Doc({
    summary: 'List translations',
    ok: 'Translation rows',
    queries: [{ name: 'context', description: 'Optional context filter' }],
  })
  findAll(@Query('context') context?: string) {
    return this.translationsService.findAll(context);
  }

  @Get('map')
  @Doc({ summary: 'Translations as nested map by locale/key', ok: 'Locale-key map' })
  findAllAsMap() {
    return this.translationsService.findAllAsMap();
  }

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.create')
  @Doc({
    summary: 'Create translation',
    ok: 'Created translation',
    permission: true,
    status: 201,
    bodyType: CreateTranslationDto,
  })
  create(@Body() dto: CreateTranslationDto) {
    return this.translationsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.update')
  @Doc({
    summary: 'Update translation',
    ok: 'Updated translation',
    permission: true,
    notFound: true,
    bodyType: UpdateTranslationDto,
    params: [{ name: 'id', description: 'Translation UUID' }],
  })
  update(@Param('id') id: string, @Body() dto: UpdateTranslationDto) {
    return this.translationsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.delete')
  @Doc({
    summary: 'Delete translation',
    ok: 'Removal result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Translation UUID' }],
  })
  delete(@Param('id') id: string) {
    return this.translationsService.delete(id);
  }

  @Post('seed')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.create')
  @Doc({
    summary: 'Bulk seed translations from JSON maps',
    ok: 'Seed result summary',
    permission: true,
  })
  seed(@Body() body: { en: Record<string, unknown>; ka: Record<string, unknown> }) {
    return this.translationsService.seedFromJson(body.en, body.ka);
  }
}
