import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaModule } from './prisma/prisma.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';


@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'USERS_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.USERS_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.USERS_SERVICE_PORT ?? '3001', 10),
        },
      },
      {
        name: 'FILES_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.FILE_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.FILE_SERVICE_TCP_PORT ?? '3004', 10),
        },
      },
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
  controllers: [MeetingController],
  providers: [MeetingService],
})
export class MeetingModule { }
