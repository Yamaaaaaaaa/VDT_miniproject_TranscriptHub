import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { CollabClientModule } from '../collab-client/collab-client.module';

@Module({
  imports: [CollabClientModule],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
