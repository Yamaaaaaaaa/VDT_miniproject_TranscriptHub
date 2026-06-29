import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { IdentityService } from '../identity.service';

@Injectable()
export class JwtIdentityGuard implements CanActivate {
  constructor(private readonly identityService: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    let token: string | null = null;

    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, t] = authHeader.split(' ');
      if (type === 'Bearer' && t) {
        token = t;
      }
    }

    if (!token && request.query && request.query.token) {
      token = request.query.token as string;
    }

    if (!token) {
      throw new UnauthorizedException('Authorization token is missing');
    }

    try {
      // Gọi microservice Identity giải mã token qua TCP
      const user = await firstValueFrom(
        this.identityService.validateToken(token),
      );
      request.user = user; // Lưu thông tin đăng nhập vào Request
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
