import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { ConversationQueryDto } from '../dto/conversation-query.dto';
import { ReplyMessageDto } from '../dto/reply-message.dto';
import { AssignConversationDto } from '../dto/assign-conversation.dto';
import { ChangeStatusDto } from '../dto/change-status.dto';
import { LinkClientDto } from '../dto/link-client.dto';

@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard)
export class ClientChatsAgentController {
  constructor(private readonly core: ClientChatsCoreService) {}

  @Get('conversations')
  listConversations(@Query() query: ConversationQueryDto) {
    return this.core.listConversations(query);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string) {
    return this.core.getConversation(id);
  }

  @Get('conversations/:id/messages')
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

  @Post('conversations/:id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyMessageDto,
    @Req() req: any,
  ) {
    return this.core.sendReply(id, req.user.id, dto.text);
  }

  @Patch('conversations/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignConversationDto) {
    return this.core.assignConversation(id, dto.userId ?? null);
  }

  @Patch('conversations/:id/status')
  changeStatus(@Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.core.changeStatus(id, dto.status);
  }

  @Post('conversations/:id/link-client')
  linkClient(@Param('id') id: string, @Body() dto: LinkClientDto) {
    return this.core.linkClient(id, dto.clientId);
  }

  @Post('conversations/:id/unlink-client')
  unlinkClient(@Param('id') id: string) {
    return this.core.unlinkClient(id);
  }
}
