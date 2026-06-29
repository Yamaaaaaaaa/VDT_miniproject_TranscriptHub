import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class UserGateway {
  constructor(
    @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
  ) {}

  async findProfileByEmail(email: string) {
    return lastValueFrom(this.usersClient.send('find_profile_by_email', email));
  }

  async findOneProfile(id: number) {
    return lastValueFrom(this.usersClient.send('find_one_profile', id));
  }
}
