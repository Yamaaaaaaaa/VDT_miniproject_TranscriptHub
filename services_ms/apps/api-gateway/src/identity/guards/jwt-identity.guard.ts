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
    const authHeader = request.headers.authorization;
    if (!authHeader)
      throw new UnauthorizedException('Authorization header is missing');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token)
      throw new UnauthorizedException('Invalid authorization header format');

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
