import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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
    return this.meetingService.createMeeting(
      payload.dto,
      payload.creatorId,
    );
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
    return this.meetingService.getMeeting(
      payload.id,
      payload.requesterId,
      payload.includeAudioFile,
      payload.includeTranscript,
    );
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
    return this.meetingService.listMeetings(
      payload.userId,
      payload.page,
      payload.size,
      payload.includeAudioFile,
      payload.includeTranscript,
    );
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
    return this.meetingService.updateMeeting(
      payload.id,
      payload.dto,
      payload.requesterId,
    );
  }

  @MessagePattern('delete_meeting')
  async deleteMeeting(@Payload() payload: { id: string; requesterId: number }) {
    return this.meetingService.deleteMeeting(
      payload.id,
      payload.requesterId,
    );
  }

  @MessagePattern('get_meeting_members')
  async getMembers(@Payload() payload: { id: string; requesterId: number }) {
    return this.meetingService.getMembers(
      payload.id,
      payload.requesterId,
    );
  }

  @MessagePattern('add_meeting_member')
  async addMember(
    @Payload() payload: { id: string; dto: AddMemberDto; requesterId: number },
  ) {
    return this.meetingService.addMember(
      payload.id,
      payload.dto,
      payload.requesterId,
    );
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
    return this.meetingService.updateMemberRole(
      payload.id,
      payload.targetUserId,
      payload.dto,
      payload.requesterId,
    );
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
    return this.meetingService.removeMember(
      payload.id,
      payload.targetUserId,
      payload.requesterId,
    );
  }
}
