import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityController } from './identity.controller';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'IDENTITY_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.IDENTITY_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.IDENTITY_SERVICE_PORT ?? '3002', 10),
        },
      },
    ]),
  ],
  controllers: [IdentityController, RolesController, PermissionsController],
  providers: [IdentityService],
  exports: [IdentityService, ClientsModule], // Xuất bản để UsersModule sử dụng JwtIdentityGuard
})
export class IdentityModule {}
