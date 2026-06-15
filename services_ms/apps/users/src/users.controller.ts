import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('find_all_profiles')
  async findAll() {
    return this.usersService.findAll();
  }

  @MessagePattern('find_one_profile')
  async findOne(@Payload() id: number) {
    return this.usersService.findOne(Number(id));
  }

  @MessagePattern('find_profile_by_email')
  async findByEmail(@Payload() email: string) {
    return this.usersService.findByEmail(email);
  }

  @MessagePattern('create_user_profile')
  async create(@Payload() createUserProfileDto: CreateUserProfileDto) {
    return this.usersService.create(createUserProfileDto);
  }

  @MessagePattern('update_user_profile')
  async update(
    @Payload()
    payload: {
      id: number;
      updateUserProfileDto: UpdateUserProfileDto;
    },
  ) {
    return this.usersService.update(
      Number(payload.id),
      payload.updateUserProfileDto,
    );
  }

  @MessagePattern('delete_user_profile')
  async remove(@Payload() id: number) {
    return this.usersService.remove(Number(id));
  }
}
