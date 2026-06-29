import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { validate } from './config/env.config';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { IdentityRepository } from './repositories/identity.repository';
import { UserGateway } from './gateways/user.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    RedisModule,
    JwtModule.register({}), // Sử dụng Dynamic sign để đổi secret giữa Access/Refresh Token
    ClientsModule.registerAsync([
      {
        name: 'USERS_CLIENT', // Kết nối sang Users Service để truy vấn/tạo user
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
  controllers: [IdentityController],
  providers: [IdentityService, IdentityRepository, UserGateway],
})
export class IdentityModule {}
