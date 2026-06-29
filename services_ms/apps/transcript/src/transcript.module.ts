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
      // TCP client để giao tiếp với file-service (get metadata, check existence)
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
      // Kafka producer — dùng để emit jobs vào transcription-jobs và transcription-dlq
      {
        name: 'TRANSCRIPT_KAFKA_PRODUCER',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'transcript-service-producer',
              brokers: configService
                .get<string>('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')
                .split(','),
            },
            producer: {
              allowAutoTopicCreation: true,
            },
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
