import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Departments')
@Controller('v1/departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Doc({
    summary: 'Create department',
    ok: 'Created department',
    status: 201,
    bodyType: CreateDepartmentDto,
  })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentsService.create(createDepartmentDto);
  }

  @Get()
  @Doc({ summary: 'List departments', ok: 'All department rows' })
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get('hierarchy')
  @Doc({ summary: 'Department hierarchy tree', ok: 'Nested department structure' })
  getHierarchy() {
    return this.departmentsService.getHierarchy();
  }

  @Get(':id')
  @Doc({
    summary: 'Get department by ID',
    ok: 'Department detail',
    notFound: true,
    params: [{ name: 'id', description: 'Department UUID' }],
  })
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @Patch(':id')
  @Doc({
    summary: 'Update department',
    ok: 'Updated department',
    notFound: true,
    bodyType: UpdateDepartmentDto,
    params: [{ name: 'id', description: 'Department UUID' }],
  })
  update(@Param('id') id: string, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @Doc({
    summary: 'Delete department',
    ok: 'Removal result',
    notFound: true,
    params: [{ name: 'id', description: 'Department UUID' }],
  })
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
