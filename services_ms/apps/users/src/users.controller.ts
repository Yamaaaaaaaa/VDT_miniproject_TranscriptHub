import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, EventPattern } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern('find_all_profiles')
  async findAll(@Payload() payload?: { search?: string }) {
    return this.usersService.findAll(payload?.search);
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

  // --- Notification Message Patterns (TCP calls from Gateway) ---
  @MessagePattern('get_notifications')
  async getNotifications(@Payload() payload: { userId: number }) {
    return this.usersService.getNotifications(payload.userId);
  }

  @MessagePattern('read_notification')
  async readNotification(@Payload() payload: { id: number; userId: number }) {
    return this.usersService.readNotification(payload.id, payload.userId);
  }

  @MessagePattern('read_all_notifications')
  async readAllNotifications(@Payload() payload: { userId: number }) {
    return this.usersService.readAllNotifications(payload.userId);
  }

  @MessagePattern('delete_notification')
  async deleteNotification(@Payload() payload: { id: number; userId: number }) {
    return this.usersService.deleteNotification(payload.id, payload.userId);
  }

  // --- Notification Event Pattern (Kafka consumer) ---
  @EventPattern('notifications')
  async handleNotificationKafkaEvent(@Payload() data: any) {
    // Normalize payload in case of multiple wrapping layers
    const payload = this.normalizeKafkaPayload(data);
    if (payload && payload.recipientId) {
      await this.usersService.handleNotificationEvent(payload);
    } else {
      console.warn('[Users Service][Kafka] Invalid notifications payload — skipping:', JSON.stringify(data));
    }
  }

  private normalizeKafkaPayload(data: any): any {
    if (!data) return null;
    if (data.value !== undefined) {
      return this.normalizeKafkaPayload(data.value);
    }
    if (data.recipientId !== undefined) {
      return data;
    }
    // Handle stringified payload
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (_) {}
    }
    return data;
  }
}
