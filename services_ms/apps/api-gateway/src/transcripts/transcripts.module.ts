import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    IdentityModule,
    ClientsModule.register([
      {
        name: 'TRANSCRIPT_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.TRANSCRIPT_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.TRANSCRIPT_SERVICE_TCP_PORT ?? '3005', 10),
        },
      },
    ]),
  ],
  controllers: [TranscriptsController],
  providers: [TranscriptsService],
  exports: [TranscriptsService],
})
export class TranscriptsModule {}
