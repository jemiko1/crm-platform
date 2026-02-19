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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessengerService } from './messenger.service';
import { MessengerGateway } from './messenger.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessageQueryDto } from './dto/message-query.dto';

@Controller('v1/messenger')
@UseGuards(JwtAuthGuard)
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly messengerGateway: MessengerGateway,
  ) {}

  // ── Current User ──────────────────────────────────────

  @Get('me')
  async getMe(@Req() req: any) {
    const employeeId = await this.messengerService.getEmployeeIdByUserId(req.user.id);
    return { employeeId };
  }

  // ── Conversations ─────────────────────────────────────

  @Get('conversations')
  getConversations(@Req() req: any, @Query() query: ConversationQueryDto) {
    return this.messengerService.getConversations(req.user.id, query);
  }

  @Post('conversations')
  createConversation(
    @Req() req: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messengerService.createConversation(req.user.id, dto);
  }

  @Get('conversations/:id')
  getConversation(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getConversation(req.user.id, id);
  }

  @Patch('conversations/:id')
  updateConversation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; avatarUrl?: string },
  ) {
    return this.messengerService.updateConversation(req.user.id, id, body);
  }

  @Post('conversations/:id/participants')
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
  markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.markAsRead(req.user.id, id);
  }

  @Post('conversations/:id/mute')
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
  getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.messengerService.getMessages(req.user.id, id, query);
  }

  @Post('conversations/:id/messages')
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
  editMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messengerService.editMessage(req.user.id, id, dto);
  }

  @Delete('messages/:id')
  deleteMessage(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.deleteMessage(req.user.id, id);
  }

  // ── Reactions ──────────────────────────────────────────

  @Post('messages/:id/reactions')
  toggleReaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { emoji: string },
  ) {
    return this.messengerService.toggleReaction(req.user.id, id, body.emoji);
  }

  @Get('messages/:id/reactions')
  getMessageReactions(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getMessageReactions(req.user.id, id);
  }

  // ── Read Status ──────────────────────────────────────

  @Get('conversations/:id/read-status')
  getMessageReadStatus(@Req() req: any, @Param('id') id: string) {
    return this.messengerService.getMessageReadStatus(req.user.id, id);
  }

  // ── Permissions ──────────────────────────────────────

  @Get('permissions')
  async getPermissions(@Req() req: any) {
    const canCreateGroup = await this.messengerService.canCreateGroup(req.user.id);
    return { canCreateGroup };
  }

  // ── Search ────────────────────────────────────────────

  @Get('search/employees')
  searchEmployees(@Req() req: any, @Query('q') q: string) {
    return this.messengerService.searchEmployees(req.user.id, q ?? '');
  }

  @Get('search/messages')
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
  getUnreadCount(@Req() req: any) {
    return this.messengerService.getUnreadCount(req.user.id);
  }
}
