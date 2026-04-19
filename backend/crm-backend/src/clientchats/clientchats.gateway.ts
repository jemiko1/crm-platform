import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import * as cookie from 'cookie';
import { PrismaService } from '../prisma/prisma.service';
import { ClientChatsEventService } from './services/clientchats-event.service';
import { QueueScheduleService } from './services/queue-schedule.service';

@WebSocketGateway({
  namespace: '/ws/clientchats',
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3001')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  },
})
export class ClientChatsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ClientChatsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly events: ClientChatsEventService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly queueSchedule: QueueScheduleService,
  ) {}

  afterInit(server: Server) {
    this.events.setServer(server);
    this.logger.log('ClientChatsGateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Connection rejected: no token (${client.id})`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwt.verify(token) as { sub: string };
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Connection rejected: invalid payload (${client.id})`);
        client.disconnect(true);
        return;
      }

      (client as any).userId = userId;
      // Also set on socket.data so RemoteSocket (fetchSockets() result)
      // can read the userId. Direct properties set on the live Socket are
      // NOT visible to RemoteSocket — only socket.data survives the serialization.
      client.data = { ...(client.data ?? {}), userId };
      client.join('agents');
      client.join(`agent:${userId}`);

      const isManager = await this.checkManagerPermission(userId);
      if (isManager) {
        client.join('managers');
        this.logger.log(`Manager connected: ${userId} (${client.id})`);
      } else {
        this.logger.log(`Agent connected: ${userId} (${client.id})`);
      }

      const queuePool = await this.queueSchedule.getActiveOperatorsToday();
      if (queuePool.includes(userId)) {
        client.join('queue');
        this.logger.debug(`Agent ${userId} joined queue room`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Connection rejected: ${msg} (${client.id})`);
      client.disconnect(true);
    }
  }

  private async checkManagerPermission(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    if (user?.isSuperAdmin) return true;

    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        position: {
          include: {
            roleGroup: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!employee?.position) return false;

    return employee.position.roleGroup.permissions.some(
      (rp) =>
        rp.permission.resource === 'client_chats' &&
        rp.permission.action === 'manage',
    );
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId) {
      this.logger.log(`Agent disconnected: ${userId} (${client.id})`);
    }
  }

  private extractToken(client: Socket): string | null {
    const cookieName = process.env.COOKIE_NAME ?? 'access_token';

    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const parsed = cookie.parse(cookies);
      if (parsed[cookieName]) return parsed[cookieName];
    }

    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    const tokenParam = client.handshake.auth?.token as string | undefined;
    if (tokenParam) return tokenParam;

    return null;
  }
}
