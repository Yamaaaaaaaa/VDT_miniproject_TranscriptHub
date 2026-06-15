import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IdentityModule } from '../identity/identity.module'; // Dùng để xác thực JWT ở bước sau

@Module({
  imports: [
    IdentityModule,
    // Đăng ký cổng kết nối qua TCP microservice
    ClientsModule.register([
      {
        name: 'USERS_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.USERS_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.USERS_SERVICE_PORT ?? '3001', 10),
        },
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
