import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    IdentityModule,
    ClientsModule.register([
      {
        name: 'FILES_CLIENT',
        transport: Transport.TCP,
        options: {
          host: process.env.FILE_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.FILE_SERVICE_TCP_PORT ?? '3004', 10),
        },
      },
    ]),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
