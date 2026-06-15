import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { IdentityRepository } from './repositories/identity.repository';
import { UserGateway } from './gateways/user.gateway';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.register({}), // Sử dụng Dynamic sign để đổi secret giữa Access/Refresh Token
    ClientsModule.register([
      {
        name: 'USERS_CLIENT', // Kết nối sang Users Service để truy vấn/tạo user
        transport: Transport.TCP,
        options: {
          host: process.env.USERS_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.USERS_SERVICE_PORT ?? '3001', 10),
        },
      },
    ]),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityRepository, UserGateway],
})
export class IdentityModule {}
