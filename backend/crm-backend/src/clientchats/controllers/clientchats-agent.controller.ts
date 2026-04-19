import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { CannedResponsesService } from '../services/canned-responses.service';
import { AssignmentService } from '../services/assignment.service';
import { ConversationQueryDto } from '../dto/conversation-query.dto';
import { AssignConversationDto } from '../dto/assign-conversation.dto';
import { ChangeStatusDto } from '../dto/change-status.dto';
import { LinkClientDto } from '../dto/link-client.dto';
import { CreateCannedResponseDto } from '../dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from '../dto/update-canned-response.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('ClientChatsAgent')
@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class ClientChatsAgentController {
  constructor(
    private readonly core: ClientChatsCoreService,
    private readonly cannedResponses: CannedResponsesService,
    private readonly assignment: AssignmentService,
  ) {}

  /**
   * Managers (client_chats.manage) and superadmins bypass per-conversation
   * scope checks. Everyone else is an operator and must own the conversation
   * or be in today's queue with the conversation unassigned.
   */
  private isManager(req: any): boolean {
    return (
      req.user.isSuperAdmin ||
      req.user.permissions?.includes('client_chats.manage')
    );
  }

  @Get('unread-count')
  @RequirePermission('client_chats.menu')
  @Doc({ summary: 'Unread client chat count for current user', ok: 'Count payload', permission: true })
  getUnreadCount(@Req() req: any) {
    return this.core.getUnreadCount(req.user.id);
  }

  @Get('conversations')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'List conversations (queue vs mine based on role)',
    ok: 'Paged conversations',
    permission: true,
  })
  async listConversations(@Query() query: ConversationQueryDto, @Req() req: any) {
    if (!this.isManager(req)) {
      const inQueue = await this.assignment.isInTodayQueue(req.user.id);
      if (inQueue) {
        query.assignedUserIdOrUnassigned = req.user.id;
      } else {
        query.assignedUserId = req.user.id;
      }
    }
    return this.core.listConversations(query);
  }

  @Get('conversations/:id')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Get conversation detail',
    ok: 'Conversation row',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async getConversation(@Param('id') id: string, @Req() req: any) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.getConversation(id);
  }

  @Get('conversations/:id/messages')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Paged messages for conversation',
    ok: 'Message list',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
    queries: [
      { name: 'page', description: 'Page number' },
      { name: 'limit', description: 'Page size' },
    ],
  })
  async getMessages(
    @Param('id') id: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.getMessages(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  private static readonly ALLOWED_MEDIA_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];

  @Post('conversations/:id/reply')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Reply to customer (multipart: text and/or file)',
    ok: 'Outbound message result',
    permission: true,
    notFound: true,
    badRequest: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'application/pdf',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('File type not allowed'), false);
        }
      },
    }),
  )
  async reply(
    @Param('id') id: string,
    @Body('text') text: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (!text?.trim() && !file) {
      throw new BadRequestException('Text or file is required');
    }
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.sendReply(
      id,
      req.user.id,
      text?.trim() || '',
      file
        ? {
            buffer: file.buffer,
            mimeType: file.mimetype,
            filename: file.originalname,
          }
        : undefined,
    );
  }

  @Post('conversations/:id/join')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Join conversation from queue',
    ok: 'Assignment result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async joinConversation(@Param('id') id: string, @Req() req: any) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.assignment.joinConversation(id, req.user.id);
  }

  @Patch('conversations/:id/assign')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Assign or unassign conversation',
    ok: 'Updated conversation',
    permission: true,
    notFound: true,
    bodyType: AssignConversationDto,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @Req() req: any,
  ) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.assignConversation(id, dto.userId ?? null);
  }

  @Patch('conversations/:id/status')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Change conversation status',
    ok: 'Updated status',
    permission: true,
    notFound: true,
    bodyType: ChangeStatusDto,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @Req() req: any,
  ) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.changeStatus(id, dto.status);
  }

  @Post('conversations/:id/request-reopen')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Request reopen of closed conversation',
    ok: 'Request recorded',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async requestReopen(@Param('id') id: string, @Req() req: any) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.requestReopen(id, req.user.id);
  }

  @Get('conversations/:id/history')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Conversation history (archived thread)',
    ok: 'History pages',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
    queries: [
      { name: 'page', description: 'Page number' },
      { name: 'limit', description: 'Page size' },
    ],
  })
  async getConversationHistory(
    @Param('id') id: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.getConversationHistory(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('conversations/:id/link-client')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Link CRM client to conversation',
    ok: 'Updated conversation',
    permission: true,
    notFound: true,
    bodyType: LinkClientDto,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async linkClient(
    @Param('id') id: string,
    @Body() dto: LinkClientDto,
    @Req() req: any,
  ) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.linkClient(id, dto.clientId);
  }

  @Post('conversations/:id/unlink-client')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Remove CRM client link',
    ok: 'Updated conversation',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  async unlinkClient(@Param('id') id: string, @Req() req: any) {
    await this.core.assertCanAccessConversation(
      id,
      req.user.id,
      this.isManager(req),
    );
    return this.core.unlinkClient(id);
  }

  @Get('whatsapp/templates')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'WhatsApp Cloud API templates',
    ok: 'Template metadata from provider',
    permission: true,
  })
  getWhatsAppTemplates() {
    return this.core.getWhatsAppTemplates();
  }

  @Post('whatsapp/send-template')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Send WhatsApp template message',
    ok: 'Provider send result',
    permission: true,
    notFound: true,
  })
  sendWhatsAppTemplate(
    @Body()
    dto: {
      conversationId: string;
      templateName: string;
      language: string;
      components?: any[];
    },
    @Req() req: any,
  ) {
    return this.core.sendWhatsAppTemplate(
      dto.conversationId,
      req.user.id,
      dto.templateName,
      dto.language,
      dto.components,
    );
  }

  @Get('media/:mediaId')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Proxy WhatsApp media binary',
    ok: 'Streamed media response',
    permission: true,
    notFound: true,
    params: [{ name: 'mediaId', description: 'WhatsApp media ID' }],
  })
  async proxyMedia(
    @Param('mediaId') mediaId: string,
    @Res() res: Response,
  ) {
    const result = await this.core.downloadWhatsAppMedia(mediaId);
    if (!result) throw new NotFoundException('Media not found');
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    result.stream.pipe(res);
  }

  // ── Canned Responses ─────────────────────────────────────

  @Get('canned-responses')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'List canned responses for operator',
    ok: 'Canned response rows',
    permission: true,
    queries: [
      { name: 'category', description: 'Category filter' },
      { name: 'channelType', description: 'Channel filter' },
      { name: 'search', description: 'Text search' },
    ],
  })
  listCannedResponses(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('channelType') channelType?: string,
    @Query('search') search?: string,
  ) {
    return this.cannedResponses.findAll(req.user.id, {
      category,
      channelType,
      search,
    });
  }

  @Post('canned-responses')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Create canned response',
    ok: 'Created canned response',
    permission: true,
    status: 201,
    bodyType: CreateCannedResponseDto,
  })
  createCannedResponse(
    @Req() req: any,
    @Body() dto: CreateCannedResponseDto,
  ) {
    return this.cannedResponses.create(
      req.user.id,
      req.user.isSuperAdmin ?? false,
      dto,
    );
  }

  @Put('canned-responses/:id')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Update canned response',
    ok: 'Updated canned response',
    permission: true,
    notFound: true,
    bodyType: UpdateCannedResponseDto,
    params: [{ name: 'id', description: 'Canned response UUID' }],
  })
  updateCannedResponse(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.cannedResponses.update(
      id,
      req.user.id,
      req.user.isSuperAdmin ?? false,
      dto,
    );
  }

  @Delete('canned-responses/:id')
  @RequirePermission('client_chats.menu')
  @Doc({
    summary: 'Delete canned response',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Canned response UUID' }],
  })
  deleteCannedResponse(@Param('id') id: string, @Req() req: any) {
    return this.cannedResponses.delete(
      id,
      req.user.id,
      req.user.isSuperAdmin ?? false,
    );
  }
}
