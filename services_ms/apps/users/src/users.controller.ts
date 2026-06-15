import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('find_all_profiles')
  async findAll() {
    try {
      return await this.usersService.findAll();
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('find_one_profile')
  async findOne(@Payload() id: number) {
    try {
      return await this.usersService.findOne(Number(id));
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('find_profile_by_email')
  async findByEmail(@Payload() email: string) {
    try {
      return await this.usersService.findByEmail(email);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('create_user_profile')
  async create(@Payload() createUserProfileDto: CreateUserProfileDto) {
    try {
      return await this.usersService.create(createUserProfileDto);
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('update_user_profile')
  async update(
    @Payload()
    payload: {
      id: number;
      updateUserProfileDto: UpdateUserProfileDto;
    },
  ) {
    try {
      return await this.usersService.update(
        Number(payload.id),
        payload.updateUserProfileDto,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('delete_user_profile')
  async remove(@Payload() id: number) {
    try {
      return await this.usersService.remove(Number(id));
    } catch (error) {
      throw new RpcException(error.message);
    }
  }
}
