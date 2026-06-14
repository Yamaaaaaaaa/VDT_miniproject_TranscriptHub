import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { FilesModule } from './files/files.module';
import { TranscriptsModule } from './transcripts/transcripts.module';

@Module({
  imports: [UsersModule, IdentityModule, FilesModule, TranscriptsModule],
  controllers: [],
  providers: [],
})
export class ApiGatewayModule { }