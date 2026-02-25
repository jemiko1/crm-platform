import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessengerService } from './messenger.service';
import * as cookie from 'cookie';
import { getCorsOrigins } from '../cors';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  employeeId?: string;
}

@WebSocketGateway({
  namespace: '/messenger',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class MessengerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  // In-memory presence: employeeId -> Set<socketId>
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private messengerService: MessengerService,
  ) {}

  // ── Connection Lifecycle ──────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const user = this.authenticateSocket(client);
      if (!user) {
        client.disconnect();
        return;
      }

      client.userId = user.id;

      const employeeId = await this.messengerService.getEmployeeIdByUserId(
        user.id,
      );
      if (!employeeId) {
        client.disconnect();
        return;
      }
      client.employeeId = employeeId;

      // Track presence
      if (!this.onlineUsers.has(employeeId)) {
        this.onlineUsers.set(employeeId, new Set());
      }
      this.onlineUsers.get(employeeId)!.add(client.id);

      // Broadcast online status (only if this is their first socket)
      if (this.onlineUsers.get(employeeId)!.size === 1) {
        this.server.emit('user:online', { employeeId });
      }

      // Join personal room for direct notifications
      client.join(`employee:${employeeId}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const employeeId = client.employeeId;
    if (!employeeId) return;

    const sockets = this.onlineUsers.get(employeeId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(employeeId);
        this.server.emit('user:offline', { employeeId });
      }
    }
  }

  // ── Socket Events ─────────────────────────────────────

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.employeeId) return;

    client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { conversationId: string; content: string; replyToId?: string },
  ) {
    if (!client.userId) return;

    try {
      const message = await this.messengerService.sendMessage(
        client.userId,
        data.conversationId,
        {
          content: data.content,
          replyToId: data.replyToId,
        },
      );

      // Broadcast to conversation room
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('message:new', message);

      // Also notify ALL participants via their personal rooms
      // This ensures bubble chats and dropdown update even if
      // the user hasn't explicitly joined the conversation room
      const participantIds =
        await this.messengerService.getConversationParticipantIds(
          data.conversationId,
        );
      for (const pid of participantIds) {
        // Send message:new to personal room too (deduplicated on client)
        this.server
          .to(`employee:${pid}`)
          .emit('message:new', message);

        this.server.to(`employee:${pid}`).emit('conversation:updated', {
          conversationId: data.conversationId,
          lastMessageAt: message.createdAt,
          lastMessageText: data.content.substring(0, 200),
          senderId: client.employeeId,
        });
      }

      return { success: true, message };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    if (!client.employeeId) return;

    const event = data.isTyping ? 'typing:start' : 'typing:stop';
    client
      .to(`conversation:${data.conversationId}`)
      .emit(event, { employeeId: client.employeeId });
  }

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId || !client.employeeId) return;

    await this.messengerService.markAsRead(client.userId, data.conversationId);

    const readPayload = {
      employeeId: client.employeeId,
      conversationId: data.conversationId,
    };

    // Broadcast to conversation room
    client
      .to(`conversation:${data.conversationId}`)
      .emit('message:read', readPayload);

    // Also broadcast to all participant personal rooms
    const participantIds =
      await this.messengerService.getConversationParticipantIds(
        data.conversationId,
      );
    for (const pid of participantIds) {
      if (pid !== client.employeeId) {
        this.server
          .to(`employee:${pid}`)
          .emit('message:read', readPayload);
      }
    }
  }

  @SubscribeMessage('message:react')
  async handleMessageReact(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; emoji: string },
  ) {
    if (!client.userId) return;

    try {
      const result = await this.messengerService.toggleReaction(
        client.userId,
        data.messageId,
        data.emoji,
      );

      const reactionPayload = {
        messageId: data.messageId,
        emoji: data.emoji,
        employeeId: client.employeeId,
        added: result.added,
      };

      // Broadcast to conversation room
      this.server
        .to(`conversation:${result.conversationId}`)
        .emit('message:reaction', reactionPayload);

      // Also broadcast to all participant personal rooms
      const reactionParticipantIds =
        await this.messengerService.getConversationParticipantIds(
          result.conversationId,
        );
      for (const pid of reactionParticipantIds) {
        this.server
          .to(`employee:${pid}`)
          .emit('message:reaction', reactionPayload);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('online:check')
  handleOnlineCheck() {
    const onlineIds = Array.from(this.onlineUsers.keys());
    return { onlineIds };
  }

  // ── Public Methods (called by service/controller) ─────

  notifyNewMessage(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:new', message);
  }

  notifyMessageEdited(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:edited', message);
  }

  notifyMessageDeleted(conversationId: string, messageId: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:deleted', { messageId });
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  emitToEmployee(employeeId: string, event: string, data: any) {
    this.server.to(`employee:${employeeId}`).emit(event, data);
  }

  // ── Auth Helper ───────────────────────────────────────

  private authenticateSocket(
    client: Socket,
  ): { id: string; email: string } | null {
    try {
      // Try cookie first
      const cookieHeader = client.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = cookie.parse(cookieHeader);
        const token =
          cookies[process.env.COOKIE_NAME ?? 'access_token'];
        if (token) {
          return this.jwtService.verify(token, {
            secret: process.env.JWT_SECRET || 'dev-secret',
          }) as any;
        }
      }

      // Try auth header
      const authHeader = client.handshake.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        return this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'dev-secret',
        }) as any;
      }

      return null;
    } catch {
      return null;
    }
  }
}
