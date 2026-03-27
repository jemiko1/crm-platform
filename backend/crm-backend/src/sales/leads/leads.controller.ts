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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
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

@ApiTags('SalesLeads')
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
  @Doc({
    summary: 'Create sales lead',
    ok: 'Created lead',
    permission: true,
    status: 201,
    bodyType: CreateLeadDto,
  })
  async create(@Body() dto: CreateLeadDto, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.create(dto, employeeId);
  }

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'List leads (scoped by permissions)',
    ok: 'Paged leads',
    permission: true,
  })
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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Lead pipeline statistics',
    ok: 'Aggregate stats',
    permission: true,
  })
  async getStatistics(@Request() req: any) {
    const employeeId = req.user.employee?.id;
    const permissions = req.user.permissions || [];
    const canViewAll = 
      req.user.isSuperAdmin || 
      permissions.includes('sales.leads.view_all');
    
    return this.leadsService.getStatistics(canViewAll ? undefined : employeeId);
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Get lead by ID',
    ok: 'Lead detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.edit_own')
  @Doc({
    summary: 'Update lead',
    ok: 'Updated lead',
    permission: true,
    notFound: true,
    bodyType: UpdateLeadDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
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
  @Doc({
    summary: 'Delete lead',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async delete(@Param('id') id: string, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.delete(id, employeeId);
  }

  // ==================== STAGE MANAGEMENT ====================

  @Post(':id/change-stage')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.leads.change_stage')
  @Doc({
    summary: 'Move lead to another pipeline stage',
    ok: 'Updated lead stage',
    permission: true,
    notFound: true,
    bodyType: ChangeStageDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
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
  @Doc({
    summary: 'Submit lead for approval',
    ok: 'Lead locked pending approval',
    permission: true,
    notFound: true,
    bodyType: SubmitForApprovalDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
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
  @Doc({
    summary: 'Approve or reject lead',
    ok: 'Approval outcome',
    permission: true,
    notFound: true,
    bodyType: ApprovalActionDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
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
  @Doc({
    summary: 'Attach service line to lead',
    ok: 'Service row created',
    notFound: true,
    bodyType: AddLeadServiceDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async addService(
    @Param('id') id: string,
    @Body() dto: AddLeadServiceDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addService(id, dto, employeeId);
  }

  @Patch(':id/services/:serviceId')
  @Doc({
    summary: 'Update lead service line',
    ok: 'Updated service',
    notFound: true,
    bodyType: UpdateLeadServiceDto,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'serviceId', description: 'Lead service UUID' },
    ],
  })
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
  @Doc({
    summary: 'Remove service from lead',
    ok: 'Service removed',
    notFound: true,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'serviceId', description: 'Lead service UUID' },
    ],
  })
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
  @Doc({
    summary: 'Add note to lead',
    ok: 'Note created',
    notFound: true,
    bodyType: CreateLeadNoteDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async addNote(
    @Param('id') id: string,
    @Body() dto: CreateLeadNoteDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addNote(id, dto, employeeId);
  }

  @Patch(':id/notes/:noteId')
  @Doc({
    summary: 'Update lead note',
    ok: 'Updated note',
    notFound: true,
    bodyType: UpdateLeadNoteDto,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'noteId', description: 'Note UUID' },
    ],
  })
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
  @Doc({
    summary: 'Delete lead note',
    ok: 'Note deleted',
    notFound: true,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'noteId', description: 'Note UUID' },
    ],
  })
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
  @Doc({
    summary: 'Add reminder on lead',
    ok: 'Reminder created',
    notFound: true,
    bodyType: CreateLeadReminderDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async addReminder(
    @Param('id') id: string,
    @Body() dto: CreateLeadReminderDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addReminder(id, dto, employeeId);
  }

  @Post(':id/reminders/:reminderId/complete')
  @Doc({
    summary: 'Mark reminder complete',
    ok: 'Reminder completed',
    notFound: true,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'reminderId', description: 'Reminder UUID' },
    ],
  })
  async completeReminder(
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.completeReminder(id, reminderId, employeeId);
  }

  @Delete(':id/reminders/:reminderId')
  @Doc({
    summary: 'Delete reminder',
    ok: 'Reminder removed',
    notFound: true,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'reminderId', description: 'Reminder UUID' },
    ],
  })
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
  @Doc({
    summary: 'Schedule appointment on lead',
    ok: 'Appointment created',
    notFound: true,
    bodyType: CreateLeadAppointmentDto,
    params: [{ name: 'id', description: 'Lead UUID' }],
  })
  async addAppointment(
    @Param('id') id: string,
    @Body() dto: CreateLeadAppointmentDto,
    @Request() req: any,
  ) {
    const employeeId = req.user.employee?.id;
    return this.leadsService.addAppointment(id, dto, employeeId);
  }

  @Post(':id/appointments/:appointmentId/complete')
  @Doc({
    summary: 'Complete appointment',
    ok: 'Appointment marked complete',
    notFound: true,
    bodyType: CompleteAppointmentDto,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'appointmentId', description: 'Appointment UUID' },
    ],
  })
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
  @Doc({
    summary: 'Cancel appointment',
    ok: 'Appointment cancelled',
    notFound: true,
    params: [
      { name: 'id', description: 'Lead UUID' },
      { name: 'appointmentId', description: 'Appointment UUID' },
    ],
  })
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
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Lead activity log',
    ok: 'Activity entries',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Lead UUID' }],
    queries: [{ name: 'category', description: 'MAIN | DETAIL | SYSTEM' }],
  })
  async getActivityLog(
    @Param('id') id: string,
    @Query('category') category?: 'MAIN' | 'DETAIL' | 'SYSTEM',
  ) {
    return this.leadsService.getActivityLog(id, category);
  }
}
