import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { PrismaModule } from './prisma/prisma.module';
import { TranscriptRepository } from './repositories/transcript.repository';
import { FileGateway } from './gateways/file.gateway';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'FILES_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.FILE_SERVICE_HOST || 'localhost',
          port: parseInt(process.env.FILE_SERVICE_TCP_PORT || '3004', 10),
        },
      },
    ]),
  ],
  controllers: [TranscriptController],
  providers: [TranscriptService, TranscriptRepository, FileGateway],
})
export class TranscriptModule {}
