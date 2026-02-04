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
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { LeadsService } from './leads.service';
import { LeadActivityService } from './lead-activity.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { ApprovalActionDto, SubmitForApprovalDto } from './dto/approval-action.dto';
import { AddLeadServiceDto, UpdateLeadServiceDto } from './dto/lead-service.dto';
import { CreateLeadNoteDto, UpdateLeadNoteDto } from './dto/lead-note.dto';
import { CreateLeadReminderDto } from './dto/lead-reminder.dto';
import { CreateLeadAppointmentDto, CompleteAppointmentDto } from './dto/lead-appointment.dto';

@Controller('v1/sales/leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly activityService: LeadActivityService,
  ) {}

  // ==================== LEAD CRUD ====================

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.create')
  async create(@Body() dto: CreateLeadDto, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.create(dto, employeeId);
  }

  @Get()
  async findAll(@Query() query: QueryLeadsDto, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    const permissions = req.user.permissions || [];
    const canViewAll = 
      req.user.isSuperAdmin || 
      permissions.includes('sales.leads.view_all') ||
      permissions.includes('sales.leads.view_team');
    
    return this.leadsService.findAll(query, employeeId, canViewAll);
  }

  @Get('statistics')
  async getStatistics(@Request() req: any) {
    const employeeId = req.user.employee?.id;
    const permissions = req.user.permissions || [];
    const canViewAll = 
      req.user.isSuperAdmin || 
      permissions.includes('sales.leads.view_all');
    
    return this.leadsService.getStatistics(canViewAll ? undefined : employeeId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.edit_own')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.update(id, dto, employeeId);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.delete')
  async delete(@Param('id') id: string, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.delete(id, employeeId);
  }

  // ==================== STAGE MANAGEMENT ====================

  @Post(':id/change-stage')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.change_stage')
  async changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.changeStage(id, dto, employeeId);
  }

  // ==================== APPROVAL WORKFLOW ====================

  @Post(':id/submit-for-approval')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.submit_approval')
  async submitForApproval(
    @Param('id') id: string,
    @Body() dto: SubmitForApprovalDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.submitForApproval(id, dto, employeeId);
  }

  @Post(':id/approval')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.approve')
  async processApproval(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.processApproval(id, dto, employeeId);
  }

  // ==================== LEAD SERVICES ====================

  @Post(':id/services')
  async addService(
    @Param('id') id: string,
    @Body() dto: AddLeadServiceDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addService(id, dto, employeeId);
  }

  @Patch(':id/services/:serviceId')
  async updateService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateLeadServiceDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.updateService(id, serviceId, dto, employeeId);
  }

  @Delete(':id/services/:serviceId')
  async removeService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.removeService(id, serviceId, employeeId);
  }

  // ==================== NOTES ====================

  @Post(':id/notes')
  async addNote(
    @Param('id') id: string,
    @Body() dto: CreateLeadNoteDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addNote(id, dto, employeeId);
  }

  @Patch(':id/notes/:noteId')
  async updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateLeadNoteDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.updateNote(id, noteId, dto, employeeId);
  }

  @Delete(':id/notes/:noteId')
  async deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.deleteNote(id, noteId, employeeId);
  }

  // ==================== REMINDERS ====================

  @Post(':id/reminders')
  async addReminder(
    @Param('id') id: string,
    @Body() dto: CreateLeadReminderDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addReminder(id, dto, employeeId);
  }

  @Post(':id/reminders/:reminderId/complete')
  async completeReminder(
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.completeReminder(id, reminderId, employeeId);
  }

  @Delete(':id/reminders/:reminderId')
  async deleteReminder(
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.deleteReminder(id, reminderId, employeeId);
  }

  // ==================== APPOINTMENTS ====================

  @Post(':id/appointments')
  async addAppointment(
    @Param('id') id: string,
    @Body() dto: CreateLeadAppointmentDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addAppointment(id, dto, employeeId);
  }

  @Post(':id/appointments/:appointmentId/complete')
  async completeAppointment(
    @Param('id') id: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: CompleteAppointmentDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.completeAppointment(id, appointmentId, dto, employeeId);
  }

  @Post(':id/appointments/:appointmentId/cancel')
  async cancelAppointment(
    @Param('id') id: string,
    @Param('appointmentId') appointmentId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.cancelAppointment(id, appointmentId, employeeId);
  }

  // ==================== ACTIVITY LOG ====================

  @Get(':id/activity')
  async getActivityLog(
    @Param('id') id: string,
    @Query('category') category?: 'MAIN' | 'DETAIL' | 'SYSTEM',
  ) {
    return this.leadsService.getActivityLog(id, category);
  }
}
