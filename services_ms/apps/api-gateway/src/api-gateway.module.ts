import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { FilesModule } from './files/files.module';
import { TranscriptsModule } from './transcripts/transcripts.module';
import { MeetingsModule } from './meetings/meetings.module';

@Module({
  imports: [UsersModule, IdentityModule, FilesModule, TranscriptsModule, MeetingsModule],
  controllers: [],
  providers: [],
})
export class ApiGatewayModule { }