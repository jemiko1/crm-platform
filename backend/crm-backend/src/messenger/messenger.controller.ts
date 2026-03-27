import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessengerService } from './messenger.service';
import { MessengerGateway } from './messenger.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Messenger')
@Controller('v1/messenger')
@UseGuards(JwtAuthGuard)
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly messengerGateway: MessengerGateway,
  ) {}

  // ── Current User ──────────────────────────────────────

  @Get('me')
  @Doc({ summary: 'Resolve current user messenger employee ID', ok: '{ employeeId }' })
  async getMe(@Req() req: any) {
    const employeeId = await this.messengerService.getEmployeeIdByUserId(req.user.id);
    return { employeeId };
  }

  // ── Conversations ─────────────────────────────────────

  @Get('conversations')
  @Doc({
    summary: 'List conversations for current user',
    ok: 'Paged conversation list',
    queries: [{ name: 'cursor', description: 'Cursor for pagination (see ConversationQueryDto)' }],
  })
  getConversations(@Req() req: any, @Query() query: ConversationQueryDto) {
    return this.messengerService.getConversations(req.user.id, query);
  }

  @Post('conversations')
  @Doc({
    summary: 'Create conversation',
    ok: 'Created conversation',
    status: 201,
    bodyType: CreateConversationDto,
  })
  createConversation(
    @Req() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messengerService.createConversation(req.user.id, dto);
  }

  @Get('conversations/:id')
  @Doc({
    summary: 'Get conversation by ID',
    ok: 'Conversation detail',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  getConversation(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getConversation(req.user.id, id);
  }

  @Patch('conversations/:id')
  @Doc({
    summary: 'Update conversation metadata',
    ok: 'Updated conversation',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  updateConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; avatarUrl?: string },
  ) {
    return this.messengerService.updateConversation(req.user.id, id, body);
  }

  @Post('conversations/:id/participants')
  @Doc({
    summary: 'Add participants to conversation',
    ok: 'Updated participant list',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  addParticipants(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { employeeIds: string[] },
  ) {
    return this.messengerService.addParticipants(
      req.user.id,
      id,
      body.employeeIds,
    );
  }

  @Delete('conversations/:id/participants/:employeeId')
  @Doc({
    summary: 'Remove participant from conversation',
    ok: 'Participant removed',
    notFound: true,
    params: [
      { name: 'id', description: 'Conversation UUID' },
      { name: 'employeeId', description: 'Employee UUID' },
    ],
  })
  removeParticipant(
    @Req() req: any,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.messengerService.removeParticipant(
      req.user.id,
      id,
      employeeId,
    );
  }

  @Post('conversations/:id/read')
  @Doc({
    summary: 'Mark conversation read for current user',
    ok: 'Read cursor updated',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.markAsRead(req.user.id, id);
  }

  @Post('conversations/:id/mute')
  @Doc({
    summary: 'Mute or unmute conversation',
    ok: 'Mute state updated',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  muteConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { mutedUntil: string | null },
  ) {
    return this.messengerService.muteConversation(
      req.user.id,
      id,
      body.mutedUntil ? new Date(body.mutedUntil) : null,
    );
  }

  @Post('conversations/:id/archive')
  @Doc({
    summary: 'Archive or unarchive conversation',
    ok: 'Archive state updated',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  archiveConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { archive: boolean },
  ) {
    return this.messengerService.archiveConversation(
      req.user.id,
      id,
      body.archive,
    );
  }

  // ── Messages ──────────────────────────────────────────

  @Get('conversations/:id/messages')
  @Doc({
    summary: 'List messages in conversation',
    ok: 'Paged messages',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.messengerService.getMessages(req.user.id, id, query);
  }

  @Post('conversations/:id/messages')
  @Doc({
    summary: 'Send message in conversation',
    ok: 'Created message (also broadcast via Socket.IO)',
    status: 201,
    notFound: true,
    bodyType: SendMessageDto,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.messengerService.sendMessage(
      req.user.id,
      id,
      dto,
    );

    // Broadcast via WebSocket to all participants
    const participantIds =
      await this.messengerService.getConversationParticipantIds(id);
    const senderEmployeeId =
      await this.messengerService.getEmployeeIdByUserId(req.user.id);

    for (const pid of participantIds) {
      this.messengerGateway.emitToEmployee(pid, 'message:new', message);
      this.messengerGateway.emitToEmployee(pid, 'conversation:updated', {
        conversationId: id,
        lastMessageAt: message.createdAt,
        lastMessageText: dto.content.substring(0, 200),
        senderId: senderEmployeeId,
      });
    }

    return message;
  }

  @Patch('messages/:id')
  @Doc({
    summary: 'Edit message',
    ok: 'Updated message',
    notFound: true,
    bodyType: UpdateMessageDto,
    params: [{ name: 'id', description: 'Message UUID' }],
  })
  editMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messengerService.editMessage(req.user.id, id, dto);
  }

  @Delete('messages/:id')
  @Doc({
    summary: 'Delete message',
    ok: 'Deletion result',
    notFound: true,
    params: [{ name: 'id', description: 'Message UUID' }],
  })
  deleteMessage(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.deleteMessage(req.user.id, id);
  }

  // ── Reactions ──────────────────────────────────────────

  @Post('messages/:id/reactions')
  @Doc({
    summary: 'Toggle emoji reaction on message',
    ok: 'Reaction state',
    notFound: true,
    params: [{ name: 'id', description: 'Message UUID' }],
  })
  toggleReaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { emoji: string },
  ) {
    return this.messengerService.toggleReaction(req.user.id, id, body.emoji);
  }

  @Get('messages/:id/reactions')
  @Doc({
    summary: 'List reactions on message',
    ok: 'Reactions payload',
    notFound: true,
    params: [{ name: 'id', description: 'Message UUID' }],
  })
  getMessageReactions(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getMessageReactions(req.user.id, id);
  }

  // ── Read Status ──────────────────────────────────────

  @Get('conversations/:id/read-status')
  @Doc({
    summary: 'Per-participant read status for conversation',
    ok: 'Read receipts',
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  getMessageReadStatus(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getMessageReadStatus(req.user.id, id);
  }

  // ── Permissions ──────────────────────────────────────

  @Get('permissions')
  @Doc({
    summary: 'Messenger capability flags for current user',
    ok: '{ canCreateGroup }',
  })
  async getPermissions(@Req() req: any) {
    const canCreateGroup = await this.messengerService.canCreateGroup(req.user.id);
    return { canCreateGroup };
  }

  // ── Search ────────────────────────────────────────────

  @Get('search/employees')
  @Doc({
    summary: 'Search employees for starting conversations',
    ok: 'Matching employees',
    queries: [{ name: 'q', description: 'Search query' }],
  })
  searchEmployees(@Req() req: any, @Query('q') q: string) {
    return this.messengerService.searchEmployees(req.user.id, q ?? '');
  }

  @Get('search/messages')
  @Doc({
    summary: 'Search messages within a conversation',
    ok: 'Matching messages',
    queries: [
      { name: 'conversationId', description: 'Conversation UUID', required: true },
      { name: 'q', description: 'Search text', required: true },
    ],
  })
  searchMessages(
    @Req() req: any,
    @Query('conversationId') conversationId: string,
    @Query('q') q: string,
  ) {
    return this.messengerService.searchMessages(
      req.user.id,
      conversationId,
      q ?? '',
    );
  }

  // ── Unread Count ──────────────────────────────────────

  @Get('unread-count')
  @Doc({ summary: 'Total unread messages for current user', ok: 'Unread counts payload' })
  getUnreadCount(@Req() req: any) {
    return this.messengerService.getUnreadCount(req.user.id);
  }
}
