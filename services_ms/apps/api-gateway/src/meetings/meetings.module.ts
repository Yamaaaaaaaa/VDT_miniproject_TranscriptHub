import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    IdentityModule,
    ClientsModule.register([
      {
        name: 'MEETING_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.MEETING_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.MEETING_SERVICE_TCP_PORT ?? '3006', 10),
        },
      },
    ]),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
