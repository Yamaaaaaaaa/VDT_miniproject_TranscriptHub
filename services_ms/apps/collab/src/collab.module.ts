import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.config';
import { PrismaModule } from './prisma/prisma.module';
import { CollabController } from './collab.controller';
import { CollabService } from './collab.service';
import { CollabRepository } from './repositories/collab.repository';
import { MeetingGateway } from './gateways/meeting.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: 'MEETING_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('MEETING_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('MEETING_SERVICE_TCP_PORT', 3006),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [CollabController],
  providers: [CollabService, CollabRepository, MeetingGateway],
})
export class CollabModule {}
