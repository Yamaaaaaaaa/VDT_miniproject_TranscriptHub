import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TcpClient } from '../common/tcp-client';

export interface IdentityUser {
  id: number;
  email: string;
  roles?: string[];
}

@Injectable()
export class IdentityClientService extends TcpClient {
  private readonly logger = new Logger(IdentityClientService.name);
  private readonly host: string;
  private readonly port: number;

  constructor(private configService: ConfigService) {
    super();
    this.host = this.configService.get<string>('collabGateway.identityServiceHost') ?? 'localhost';
    this.port = this.configService.get<number>('collabGateway.identityServicePort') ?? 3002;
  }

  async validateToken(token: string): Promise<IdentityUser> {
    const response = await TcpClient.send(this.host, this.port, 'validate_token', { token });
    if (!response.success) {
      throw new Error(response.message || 'Token validation failed');
    }
    return response.data;
  }

  async getMeetingRole(
    meetingId: string,
    userId: number,
  ): Promise<'HOST' | 'EDITOR' | 'VIEWER'> {
    try {
      const response = await TcpClient.send(this.host, this.port, 'get_meeting_role', {
        meetingId,
        userId,
      });
      if (!response.success) {
        if (response.message?.includes('not found')) {
          return 'VIEWER';
        }
        throw new Error(response.message || 'Failed to get meeting role');
      }
      return response.data.role;
    } catch (error) {
      this.logger.error(`Failed to get meeting role: ${error.message}`);
      return 'VIEWER';
    }
  }
}
