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
import { ApiTags } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { DeletePositionDto } from './dto/delete-position.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Positions')
@Controller('v1/positions')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @Doc({
    summary: 'Create position',
    ok: 'Created position',
    permission: true,
    status: 201,
    bodyType: CreatePositionDto,
  })
  create(@Body() createPositionDto: CreatePositionDto) {
    return this.positionsService.create(createPositionDto);
  }

  @Get()
  @Doc({ summary: 'List positions', ok: 'All positions', permission: true })
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @Doc({
    summary: 'Get position by ID',
    ok: 'Position detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Position UUID' }],
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.findOne(id);
  }

  @Get('code/:code')
  @Doc({
    summary: 'Get position by code',
    ok: 'Position detail',
    permission: true,
    notFound: true,
    params: [{ name: 'code', description: 'Position code' }],
  })
  findByCode(@Param('code') code: string) {
    return this.positionsService.findByCode(code);
  }

  @Patch(':id')
  @Doc({
    summary: 'Update position',
    ok: 'Updated position',
    permission: true,
    notFound: true,
    bodyType: UpdatePositionDto,
    params: [{ name: 'id', description: 'Position UUID' }],
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePositionDto: UpdatePositionDto,
  ) {
    return this.positionsService.update(id, updatePositionDto);
  }

  @Delete(':id')
  @Doc({
    summary: 'Delete position',
    ok: 'Removal or reassignment result',
    permission: true,
    notFound: true,
    bodyType: DeletePositionDto,
    params: [{ name: 'id', description: 'Position UUID' }],
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deleteDto?: DeletePositionDto,
  ) {
    return this.positionsService.remove(id, deleteDto?.replacementPositionId);
  }

  @Get(':id/permissions')
  @Doc({
    summary: 'Permissions assigned to position',
    ok: 'Permission list for the position',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Position UUID' }],
  })
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.positionsService.getPositionPermissions(id);
  }

  /**
   * Get available positions for a department, including inherited positions from parent departments.
   * Root-level department positions are NOT inherited.
   */
  @Get('department/:departmentId/available')
  @Doc({
    summary: 'Positions available for a department (inheritance rules apply)',
    ok: 'Eligible positions for assignment',
    permission: true,
    notFound: true,
    params: [{ name: 'departmentId', description: 'Department UUID' }],
  })
  getAvailableForDepartment(@Param('departmentId', ParseUUIDPipe) departmentId: string) {
    return this.positionsService.getAvailablePositionsForDepartment(departmentId);
  }

  /**
   * Get global positions (positions not assigned to any department)
   */
  @Get('global')
  @Doc({
    summary: 'Global positions (not tied to a department)',
    ok: 'Global position list',
    permission: true,
  })
  getGlobalPositions() {
    return this.positionsService.getGlobalPositions();
  }
}
