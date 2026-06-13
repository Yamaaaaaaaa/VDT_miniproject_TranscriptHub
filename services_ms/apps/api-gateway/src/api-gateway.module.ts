import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { FilesController } from './files/files.controller';

@Module({
  imports: [UsersModule, IdentityModule],
  controllers: [FilesController],
  providers: [],
})
export class ApiGatewayModule { }