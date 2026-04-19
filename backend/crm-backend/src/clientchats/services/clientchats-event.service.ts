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

  /**
   * Recompute queue-room membership for all connected operator sockets against
   * the authoritative `activeOperatorIds` list for today.
   *
   * - Sockets whose userId is in the list and are not yet in the `queue` room
   *   are joined and receive `queue:membership-changed` with `{inQueue: true}`.
   * - Sockets whose userId is NOT in the list but ARE in the `queue` room
   *   are removed and receive `queue:membership-changed` with `{inQueue: false}`.
   *
   * Called after a QueueScheduleService mutation so mid-day schedule edits
   * take effect without requiring operators to reconnect.
   *
   * Returns a summary of changes for observability/tests.
   */
  async refreshQueueMembership(activeOperatorIds: string[]): Promise<{
    joined: string[];
    left: string[];
  }> {
    const joined: string[] = [];
    const left: string[] = [];
    if (!this.server) return { joined, left };

    const activeSet = new Set(activeOperatorIds);
    let sockets: any[] = [];
    try {
      // Socket.IO v4: fetchSockets() returns RemoteSocket[] scoped to this
      // namespace. Each socket exposes rooms (Set<string>), data, join(), leave().
      sockets = await (this.server as any).fetchSockets();
    } catch (err) {
      this.logger.warn(
        `refreshQueueMembership: fetchSockets failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { joined, left };
    }

    for (const socket of sockets) {
      const userId: string | undefined =
        (socket as any).data?.userId ?? (socket as any).userId;
      if (!userId) continue;

      const inQueueRoom: boolean =
        (socket as any).rooms instanceof Set
          ? (socket as any).rooms.has('queue')
          : false;
      const shouldBeInQueue = activeSet.has(userId);

      if (shouldBeInQueue && !inQueueRoom) {
        try {
          await socket.join('queue');
          socket.emit('queue:membership-changed', { inQueue: true });
          joined.push(userId);
        } catch (err) {
          this.logger.warn(
            `refreshQueueMembership: join failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (!shouldBeInQueue && inQueueRoom) {
        try {
          await socket.leave('queue');
          socket.emit('queue:membership-changed', { inQueue: false });
          left.push(userId);
        } catch (err) {
          this.logger.warn(
            `refreshQueueMembership: leave failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (joined.length || left.length) {
      this.logger.log(
        `refreshQueueMembership: joined=${joined.length} left=${left.length}`,
      );
    }
    return { joined, left };
  }

  getConnectedAgentIds(): string[] {
    if (!this.server) return [];
    const ids: string[] = [];
    const sockets = (this.server as any).sockets;
    if (sockets instanceof Map) {
      for (const [, socket] of sockets) {
        const userId = (socket as any)?.userId;
        if (userId && !ids.includes(userId)) ids.push(userId);
      }
    }
    return ids;
  }
}
