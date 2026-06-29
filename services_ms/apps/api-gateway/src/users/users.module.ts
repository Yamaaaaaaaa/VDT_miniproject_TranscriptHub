import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IdentityModule } from '../identity/identity.module'; // Dùng để xác thực JWT ở bước sau

@Module({
  imports: [
    IdentityModule,
    // Đăng ký cổng kết nối qua TCP microservice dạng bất đồng bộ
    ClientsModule.registerAsync([
      {
        name: 'USERS_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('USERS_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('USERS_SERVICE_PORT', 3001),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
