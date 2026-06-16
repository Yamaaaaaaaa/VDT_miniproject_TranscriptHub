import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CollabGatewayGateway } from './collab-gateway.gateway';
import { CacheModule } from './cache/cache.module';
import { IdentityClientModule } from './identity-client/identity-client.module';
import { CollabClientModule } from './collab-client/collab-client.module';
import { RoomModule } from './room/room.module';
import { collabGatewayConfig } from './config/env.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [collabGatewayConfig],
    }),
    CacheModule,
    IdentityClientModule,
    CollabClientModule,
    RoomModule,
  ],
  providers: [CollabGatewayGateway],
})
export class CollabGatewayModule {}
