import { Module } from '@nestjs/common';
import { CollabClientService } from './collab-client.service';

@Module({
  providers: [CollabClientService],
  exports: [CollabClientService],
})
export class CollabClientModule {}
