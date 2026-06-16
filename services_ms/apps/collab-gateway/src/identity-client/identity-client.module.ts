import { Module } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';

@Module({
  providers: [IdentityClientService],
  exports: [IdentityClientService],
})
export class IdentityClientModule {}
