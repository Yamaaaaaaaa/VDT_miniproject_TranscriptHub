import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.config';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { PrismaModule } from './prisma/prisma.module';
import { TranscriptRepository } from './repositories/transcript.repository';
import { FileGateway } from './gateways/file.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    ClientsModule.registerAsync([
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
    ]),
  ],
  controllers: [TranscriptController],
  providers: [TranscriptService, TranscriptRepository, FileGateway],
})
export class TranscriptModule {}
