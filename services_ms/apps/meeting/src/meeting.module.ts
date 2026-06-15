import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.config';
import { PrismaModule } from './prisma/prisma.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingRepository } from './repositories/meeting.repository';
import { UserGateway } from './gateways/user.gateway';
import { FileGateway } from './gateways/file.gateway';
import { TranscriptGateway } from './gateways/transcript.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
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
      {
        name: 'FILES_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('FILE_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('FILE_SERVICE_TCP_PORT', 3004),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'TRANSCRIPT_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('TRANSCRIPT_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('TRANSCRIPT_SERVICE_TCP_PORT', 3005),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    MeetingRepository,
    UserGateway,
    FileGateway,
    TranscriptGateway,
  ],
})
export class MeetingModule {}
