import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { IdentityController } from './identity.controller';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'IDENTITY_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('IDENTITY_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('IDENTITY_SERVICE_PORT', 3002),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [IdentityController, RolesController, PermissionsController],
  providers: [IdentityService],
  exports: [IdentityService, ClientsModule], // Xuất bản để UsersModule sử dụng JwtIdentityGuard
})
export class IdentityModule {}
