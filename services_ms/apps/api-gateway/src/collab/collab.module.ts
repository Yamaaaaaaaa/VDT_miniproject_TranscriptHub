import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { CollabController } from './collab.controller';
import { CollabService } from './collab.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'COLLAB_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('COLLAB_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('COLLAB_SERVICE_TCP_PORT', 3007),
          },
        }),
        inject: [ConfigService],
      },
    ]),
    IdentityModule,
  ],
  controllers: [CollabController],
  providers: [CollabService],
})
export class CollabModule {}
