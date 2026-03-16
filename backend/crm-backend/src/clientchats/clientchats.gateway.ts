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
import { ClientChatsEventService } from './services/clientchats-event.service';

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
  ) {}

  afterInit(server: Server) {
    this.events.setServer(server);
    this.logger.log('ClientChatsGateway initialized');
  }

  handleConnection(client: Socket) {
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
      client.join('agents');
      client.join(`agent:${userId}`);

      this.logger.log(`Agent connected: ${userId} (${client.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Connection rejected: ${msg} (${client.id})`);
      client.disconnect(true);
    }
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
