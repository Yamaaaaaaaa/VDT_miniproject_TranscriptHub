import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { IdentityModule } from './identity/identity.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [UsersModule, IdentityModule, FilesModule],
  controllers: [],
  providers: [],
})
export class ApiGatewayModule { }