import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UserGateway {
  constructor(
    @Inject('USERS_CLIENT') private readonly usersClient: ClientProxy,
  ) {}

  async createUserProfile(id: number, name: string, email: string) {
    return firstValueFrom(
      this.usersClient.send('create_user_profile', { id, name, email }),
    );
  }

  async findOneProfile(id: number) {
    return firstValueFrom(this.usersClient.send('find_one_profile', id));
  }
}
