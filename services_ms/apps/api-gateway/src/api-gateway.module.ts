import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.config';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { FilesModule } from './files/files.module';
import { TranscriptsModule } from './transcripts/transcripts.module';
import { MeetingsModule } from './meetings/meetings.module';
import { CollabModule } from './collab/collab.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    UsersModule,
    IdentityModule,
    FilesModule,
    TranscriptsModule,
    MeetingsModule,
    CollabModule,
  ],
  controllers: [],
  providers: [],
})
export class ApiGatewayModule {}
