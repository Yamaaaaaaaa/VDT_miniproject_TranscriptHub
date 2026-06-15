import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Controller()
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @MessagePattern('create_meeting')
  async createMeeting(
    @Payload() payload: { dto: CreateMeetingDto; creatorId: number },
  ) {
    try {
      return await this.meetingService.createMeeting(
        payload.dto,
        payload.creatorId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('get_meeting')
  async getMeeting(
    @Payload()
    payload: {
      id: string;
      requesterId: number;
      includeAudioFile: boolean;
      includeTranscript: boolean;
    },
  ) {
    try {
      return await this.meetingService.getMeeting(
        payload.id,
        payload.requesterId,
        payload.includeAudioFile,
        payload.includeTranscript,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('list_meetings')
  async listMeetings(
    @Payload()
    payload: {
      userId: number;
      page: number;
      size: number;
      includeAudioFile: boolean;
      includeTranscript: boolean;
    },
  ) {
    try {
      return await this.meetingService.listMeetings(
        payload.userId,
        payload.page,
        payload.size,
        payload.includeAudioFile,
        payload.includeTranscript,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('update_meeting')
  async updateMeeting(
    @Payload()
    payload: {
      id: string;
      dto: UpdateMeetingDto;
      requesterId: number;
    },
  ) {
    try {
      return await this.meetingService.updateMeeting(
        payload.id,
        payload.dto,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('delete_meeting')
  async deleteMeeting(@Payload() payload: { id: string; requesterId: number }) {
    try {
      return await this.meetingService.deleteMeeting(
        payload.id,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('get_meeting_members')
  async getMembers(@Payload() payload: { id: string; requesterId: number }) {
    try {
      return await this.meetingService.getMembers(
        payload.id,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('add_meeting_member')
  async addMember(
    @Payload() payload: { id: string; dto: AddMemberDto; requesterId: number },
  ) {
    try {
      return await this.meetingService.addMember(
        payload.id,
        payload.dto,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('update_meeting_member_role')
  async updateMemberRole(
    @Payload()
    payload: {
      id: string;
      targetUserId: number;
      dto: UpdateMemberDto;
      requesterId: number;
    },
  ) {
    try {
      return await this.meetingService.updateMemberRole(
        payload.id,
        payload.targetUserId,
        payload.dto,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('remove_meeting_member')
  async removeMember(
    @Payload()
    payload: {
      id: string;
      targetUserId: number;
      requesterId: number;
    },
  ) {
    try {
      return await this.meetingService.removeMember(
        payload.id,
        payload.targetUserId,
        payload.requesterId,
      );
    } catch (error) {
      throw new RpcException(error.message);
    }
  }
}
