import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validate } from './config/env.config';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { PrismaModule } from './prisma/prisma.module';
import { FileRepository } from './repositories/file.repository';
import { KafkaGateway } from './gateways/kafka.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'file-service',
              brokers: [configService.get<string>('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')],
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
  controllers: [FileController],
  providers: [FileService, FileRepository, KafkaGateway],
})
export class FileModule {}
