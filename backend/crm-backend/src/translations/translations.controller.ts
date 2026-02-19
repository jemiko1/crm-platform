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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TranslationsService } from './translations.service';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';

@Controller('v1/translations')
@UseGuards(JwtAuthGuard)
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  @Get()
  findAll(@Query('context') context?: string) {
    return this.translationsService.findAll(context);
  }

  @Get('map')
  findAllAsMap() {
    return this.translationsService.findAllAsMap();
  }

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.create')
  create(@Body() dto: CreateTranslationDto) {
    return this.translationsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.update')
  update(@Param('id') id: string, @Body() dto: UpdateTranslationDto) {
    return this.translationsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.delete')
  delete(@Param('id') id: string) {
    return this.translationsService.delete(id);
  }

  @Post('seed')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('admin.create')
  seed(@Body() body: { en: Record<string, unknown>; ka: Record<string, unknown> }) {
    return this.translationsService.seedFromJson(body.en, body.ka);
  }
}
