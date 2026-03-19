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
    this.server.to('managers').emit('conversation:new', conversation);
    const assignedId = conversation.assignedUserId as string | undefined;
    if (assignedId) {
      this.server.to(`agent:${assignedId}`).emit('conversation:new', conversation);
    } else {
      this.server.to('queue').emit('conversation:new', conversation);
    }
  }

  emitConversationUpdated(
    conversation: Record<string, unknown>,
    previousAssignedUserId?: string | null,
  ) {
    if (!this.server) return;
    this.server.to('managers').emit('conversation:updated', conversation);
    const assignedId = conversation.assignedUserId as string | undefined;
    if (assignedId) {
      this.server
        .to(`agent:${assignedId}`)
        .emit('conversation:updated', conversation);
    } else {
      this.server.to('queue').emit('conversation:updated', conversation);
    }
    if (previousAssignedUserId && previousAssignedUserId !== assignedId) {
      this.server
        .to(`agent:${previousAssignedUserId}`)
        .emit('conversation:updated', conversation);
    }
  }

  emitNewMessage(
    conversationId: string,
    message: Record<string, unknown>,
    assignedUserId?: string | null,
  ) {
    if (!this.server) return;
    const payload = { conversationId, message };
    this.server.to('managers').emit('message:new', payload);
    if (assignedUserId) {
      this.server.to(`agent:${assignedUserId}`).emit('message:new', payload);
    } else {
      this.server.to('queue').emit('message:new', payload);
    }
  }

  emitToManagers(event: string, data: unknown) {
    if (!this.server) return;
    this.server.to('managers').emit(event, data);
  }

  emitToAgent(userId: string, event: string, data: unknown) {
    if (!this.server) return;
    this.server.to(`agent:${userId}`).emit(event, data);
  }

  emitQueueUpdated(data: unknown) {
    this.emitToManagers('queue:updated', data);
  }

  getConnectedAgentIds(): string[] {
    if (!this.server) return [];
    const ids: string[] = [];
    const sockets = this.server.sockets;
    if (sockets) {
      for (const [, socket] of sockets as any) {
        const userId = (socket as any)?.userId;
        if (userId && !ids.includes(userId)) ids.push(userId);
      }
    }
    return ids;
  }
}
