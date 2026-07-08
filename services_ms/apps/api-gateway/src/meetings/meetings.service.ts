import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, catchError, throwError } from 'rxjs';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class MeetingsService {
  constructor(
    @Inject('MEETING_CLIENT') private readonly meetingClient: ClientProxy,
  ) {}

  create(dto: CreateMeetingDto, creatorId: number): Observable<any> {
    return this.meetingClient
      .send('create_meeting', { dto, creatorId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  findOne(
    id: string,
    requesterId: number,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ): Observable<any> {
    return this.meetingClient
      .send('get_meeting', {
        id,
        requesterId,
        includeAudioFile,
        includeTranscript,
      })
      .pipe(catchError((err) => throwError(() => err)));
  }

  findAll(
    userId: number,
    page: number,
    size: number,
    search?: string,
    includeAudioFile?: boolean,
    includeTranscript?: boolean,
  ): Observable<any> {
    return this.meetingClient
      .send('list_meetings', {
        userId,
        page,
        size,
        search,
        includeAudioFile,
        includeTranscript,
      })
      .pipe(catchError((err) => throwError(() => err)));
  }

  update(
    id: string,
    dto: UpdateMeetingDto,
    requesterId: number,
  ): Observable<any> {
    return this.meetingClient
      .send('update_meeting', { id, dto, requesterId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  remove(id: string, requesterId: number): Observable<any> {
    return this.meetingClient
      .send('delete_meeting', { id, requesterId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  getMembers(id: string, requesterId: number): Observable<any> {
    return this.meetingClient
      .send('get_meeting_members', { id, requesterId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  addMember(
    id: string,
    dto: AddMemberDto,
    requesterId: number,
  ): Observable<any> {
    return this.meetingClient
      .send('add_meeting_member', { id, dto, requesterId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  updateMemberRole(
    id: string,
    targetUserId: number,
    dto: UpdateMemberDto,
    requesterId: number,
  ): Observable<any> {
    return this.meetingClient
      .send('update_meeting_member_role', {
        id,
        targetUserId,
        dto,
        requesterId,
      })
      .pipe(catchError((err) => throwError(() => err)));
  }

  removeMember(
    id: string,
    targetUserId: number,
    requesterId: number,
  ): Observable<any> {
    return this.meetingClient
      .send('remove_meeting_member', { id, targetUserId, requesterId })
      .pipe(catchError((err) => throwError(() => err)));
  }

  findByAudioFileId(
    audioFileId: string,
    requesterId: number,
    includeAudioFile: boolean,
    includeTranscript: boolean,
  ): Observable<any> {
    return this.meetingClient
      .send('get_meeting_by_audio_file', {
        audioFileId,
        requesterId,
        includeAudioFile,
        includeTranscript,
      })
      .pipe(catchError((err) => throwError(() => err)));
  }
}

