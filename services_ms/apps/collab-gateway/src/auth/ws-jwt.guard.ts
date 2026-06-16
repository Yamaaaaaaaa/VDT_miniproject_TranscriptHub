import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { IdentityClientService } from '../identity-client/identity-client.service';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';

export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  meetingId: string;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private identityClient: IdentityClientService,
    private cacheService: CacheService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.query.token as string;
    const meetingId = client.handshake.query.meetingId as string;

    if (!token || !meetingId) {
      throw new WsException('Missing token or meetingId');
    }

    try {
      const user = await this.identityClient.validateToken(token);
      const role = await this.getUserRoleWithCache(meetingId, user.id);

      client.data.user = {
        userId: user.id,
        email: user.email,
        role,
        meetingId,
      } as AuthenticatedUser;

      this.logger.log(`User ${user.id} authenticated with role ${role}`);
      return true;
    } catch (error) {
      this.logger.warn(`Auth failed: ${error.message}`);
      throw new WsException('Unauthorized');
    }
  }

  private async getUserRoleWithCache(
    meetingId: string,
    userId: number,
  ): Promise<'HOST' | 'EDITOR' | 'VIEWER'> {
    const cacheKey = `meeting:${meetingId}:user:${userId}:role`;
    const ttl = this.configService.get<number>('collabGateway.roleCacheTtl') ?? 300;

    const cachedRole = await this.cacheService.get<'HOST' | 'EDITOR' | 'VIEWER'>(cacheKey);
    if (cachedRole) {
      this.logger.debug(`Role cache hit: ${cacheKey} = ${cachedRole}`);
      return cachedRole;
    }

    const role = await this.identityClient.getMeetingRole(meetingId, userId);
    await this.cacheService.set(cacheKey, role, ttl);

    return role;
  }
}
