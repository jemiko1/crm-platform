import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class ClientChatsEventService {
  private readonly logger = new Logger(ClientChatsEventService.name);
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
    this.logger.log('WebSocket server attached to event service');
  }

  emitConversationNew(conversation: Record<string, unknown>) {
    if (!this.server) return;
    this.server.to('agents').emit('conversation:new', conversation);
  }

  emitConversationUpdated(conversation: Record<string, unknown>) {
    if (!this.server) return;
    this.server.to('agents').emit('conversation:updated', conversation);
  }

  emitNewMessage(conversationId: string, message: Record<string, unknown>) {
    if (!this.server) return;
    this.server
      .to('agents')
      .emit('message:new', { conversationId, message });
  }
}
