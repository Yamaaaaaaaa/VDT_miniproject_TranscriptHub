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

  // --- Notification Service Methods ---
  async getNotifications(userId: number) {
    return this.usersRepo.getNotifications(userId);
  }

  async readNotification(id: number, userId: number) {
    const existing = await this.usersRepo.findNotificationById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.USER_NOT_FOUND, 'Notification not found');
    }
    if (existing.userId !== userId) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, 'Access denied');
    }
    await this.usersRepo.readNotification(id, userId);
    return { success: true };
  }

  async readAllNotifications(userId: number) {
    await this.usersRepo.readAllNotifications(userId);
    return { success: true };
  }

  async deleteNotification(id: number, userId: number) {
    const existing = await this.usersRepo.findNotificationById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.USER_NOT_FOUND, 'Notification not found');
    }
    if (existing.userId !== userId) {
      throw new AppException(ErrorCodes.UNAUTHORIZED, 'Access denied');
    }
    await this.usersRepo.deleteNotification(id, userId);
    return { success: true };
  }

  async handleNotificationEvent(payload: any) {
    console.log('[Users Service] Handling Kafka notification event:', JSON.stringify(payload));
    const { recipientId, type, meetingTitle, role, url } = payload;

    let title = 'Thông báo cuộc họp';
    let content = 'Có thay đổi liên quan đến cuộc họp của bạn.';

    if (type === 'MEETING_ACCESS_GRANTED') {
      title = 'Được thêm vào cuộc họp';
      content = `Bạn đã được thêm vào cuộc họp "${meetingTitle}" với vai trò ${role === 'EDITOR' ? 'Biên tập viên' : 'Người xem'}.`;
    } else if (type === 'MEETING_ROLE_UPDATED') {
      title = 'Cập nhật vai trò cuộc họp';
      content = `Vai trò của bạn trong cuộc họp "${meetingTitle}" đã được cập nhật thành ${role === 'EDITOR' ? 'Biên tập viên' : 'Người xem'}.`;
    } else if (type === 'MEETING_ACCESS_REVOKED') {
      title = 'Thu hồi quyền truy cập';
      content = `Quyền truy cập của bạn vào cuộc họp "${meetingTitle}" đã bị thu hồi bởi Chủ phòng.`;
    }

    return this.usersRepo.createNotification(
      recipientId,
      title,
      content,
      url,
    );
  }
}
