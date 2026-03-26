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

@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class ClientChatsAgentController {
  constructor(
    private readonly core: ClientChatsCoreService,
    private readonly cannedResponses: CannedResponsesService,
    private readonly assignment: AssignmentService,
  ) {}

  @Get('unread-count')
  @RequirePermission('client_chats.menu')
  getUnreadCount(@Req() req: any) {
    return this.core.getUnreadCount(req.user.id);
  }

  @Get('conversations')
  @RequirePermission('client_chats.menu')
  async listConversations(@Query() query: ConversationQueryDto, @Req() req: any) {
    const isManager =
      req.user.isSuperAdmin ||
      req.user.permissions?.includes('client_chats.manage');
    if (!isManager) {
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
  getConversation(@Param('id') id: string) {
    return this.core.getConversation(id);
  }

  @Get('conversations/:id/messages')
  @RequirePermission('client_chats.menu')
  getMessages(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
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
  reply(
    @Param('id') id: string,
    @Body('text') text: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (!text?.trim() && !file) {
      throw new BadRequestException('Text or file is required');
    }
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
  joinConversation(@Param('id') id: string, @Req() req: any) {
    return this.assignment.joinConversation(id, req.user.id);
  }

  @Patch('conversations/:id/assign')
  @RequirePermission('client_chats.menu')
  assign(@Param('id') id: string, @Body() dto: AssignConversationDto) {
    return this.core.assignConversation(id, dto.userId ?? null);
  }

  @Patch('conversations/:id/status')
  @RequirePermission('client_chats.menu')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.core.changeStatus(id, dto.status);
  }

  @Post('conversations/:id/request-reopen')
  @RequirePermission('client_chats.menu')
  requestReopen(@Param('id') id: string, @Req() req: any) {
    return this.core.requestReopen(id, req.user.id);
  }

  @Get('conversations/:id/history')
  @RequirePermission('client_chats.menu')
  getConversationHistory(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.core.getConversationHistory(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('conversations/:id/link-client')
  @RequirePermission('client_chats.menu')
  linkClient(@Param('id') id: string, @Body() dto: LinkClientDto) {
    return this.core.linkClient(id, dto.clientId);
  }

  @Post('conversations/:id/unlink-client')
  @RequirePermission('client_chats.menu')
  unlinkClient(@Param('id') id: string) {
    return this.core.unlinkClient(id);
  }

  @Get('whatsapp/templates')
  @RequirePermission('client_chats.menu')
  getWhatsAppTemplates() {
    return this.core.getWhatsAppTemplates();
  }

  @Post('whatsapp/send-template')
  @RequirePermission('client_chats.menu')
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
  deleteCannedResponse(@Param('id') id: string, @Req() req: any) {
    return this.cannedResponses.delete(
      id,
      req.user.id,
      req.user.isSuperAdmin ?? false,
    );
  }
}
