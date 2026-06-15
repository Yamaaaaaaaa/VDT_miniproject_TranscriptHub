import { Injectable } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { AppException, ErrorCodes } from '../../../libs/common/src/exceptions/error-code';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  async findAll() {
    const profiles = await this.usersRepo.findAllWithAccount();

    return profiles.map((p) => {
      const roleName = p.account?.roles?.[0]?.role?.name ?? 'USER';
      const { account: _account, ...rest } = p;
      return {
        ...rest,
        role: roleName,
      };
    });
  }

  async findOne(id: number) {
    const profile = await this.usersRepo.findByIdWithAccount(id);
    if (!profile)
      throw new AppException(ErrorCodes.USER_NOT_EXISTED, `User profile with id ${id} not found`);

    const roleName = profile.account?.roles?.[0]?.role?.name ?? 'USER';
    const { account: _account, ...rest } = profile;
    return {
      ...rest,
      role: roleName,
    };
  }

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }

  async create(createUserProfileDto: CreateUserProfileDto) {
    const existing = await this.usersRepo.findByEmail(
      createUserProfileDto.email,
    );
    if (existing)
      throw new AppException(
        ErrorCodes.EMAIL_EXISTED,
        `Profile with email ${createUserProfileDto.email} already exists`,
      );

    return this.usersRepo.create(createUserProfileDto);
  }

  async update(id: number, updateUserProfileDto: UpdateUserProfileDto) {
    await this.findOne(id);
    return this.usersRepo.update(id, updateUserProfileDto);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.usersRepo.delete(id);
    return { message: `User profile ${id} deleted successfully` };
  }
}
