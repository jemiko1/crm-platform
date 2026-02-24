import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { DeletePositionDto } from './dto/delete-position.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';

@Controller('v1/positions')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  create(@Body() createPositionDto: CreatePositionDto) {
    return this.positionsService.create(createPositionDto);
  }

  @Get()
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.findOne(id);
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.positionsService.findByCode(code);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePositionDto: UpdatePositionDto,
  ) {
    return this.positionsService.update(id, updatePositionDto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deleteDto?: DeletePositionDto,
  ) {
    return this.positionsService.remove(id, deleteDto?.replacementPositionId);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.getPositionPermissions(id);
  }

  /**
   * Get available positions for a department, including inherited positions from parent departments.
   * Root-level department positions are NOT inherited.
   */
  @Get('department/:departmentId/available')
  getAvailableForDepartment(@Param('departmentId', ParseUUIDPipe) departmentId: string) {
    return this.positionsService.getAvailablePositionsForDepartment(departmentId);
  }

  /**
   * Get global positions (positions not assigned to any department)
   */
  @Get('global')
  getGlobalPositions() {
    return this.positionsService.getGlobalPositions();
  }
}
