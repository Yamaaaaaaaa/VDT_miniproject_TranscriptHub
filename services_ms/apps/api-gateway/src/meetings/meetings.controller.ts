import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { catchError, map, throwError } from 'rxjs';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

function mapException(err: any) {
  const message = err?.message || 'Internal server error';
  let status = HttpStatus.INTERNAL_SERVER_ERROR;

  if (
    message.toLowerCase().includes('not found') ||
    message.toLowerCase().includes('notfound')
  ) {
    status = HttpStatus.NOT_FOUND;
  } else if (
    message.toLowerCase().includes('permission') ||
    message.toLowerCase().includes('forbidden') ||
    message.toLowerCase().includes('do not have permission')
  ) {
    status = HttpStatus.FORBIDDEN;
  } else if (
    message.toLowerCase().includes('already') ||
    message.toLowerCase().includes('invalid') ||
    message.toLowerCase().includes('must not')
  ) {
    status = HttpStatus.BAD_REQUEST;
  }

  return throwError(() => new HttpException(message, status));
}

@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('v1/meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new meeting (Requires Auth)' })
  @ApiResponse({ status: 201, description: 'Meeting created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or audio file already linked.',
  })
  @ApiResponse({ status: 404, description: 'Audio file not found.' })
  create(@Body() dto: CreateMeetingDto, @Req() req: any) {
    const creatorId = req.user.id;
    return this.meetingsService.create(dto, creatorId).pipe(
      map((res) => ({ result: res })),
      catchError(mapException),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single meeting by ID (Requires Auth & Membership)',
  })
  @ApiQuery({
    name: 'includeAudioFile',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiQuery({
    name: 'includeTranscript',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Meeting details retrieved successfully.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden (Not a member).' })
  @ApiResponse({ status: 404, description: 'Meeting not found.' })
  findOne(
    @Param('id') id: string,
    @Query('includeAudioFile') includeAudioFile = 'false',
    @Query('includeTranscript') includeTranscript = 'false',
    @Req() req: any,
  ) {
    const requesterId = req.user.id;
    return this.meetingsService
      .findOne(
        id,
        requesterId,
        includeAudioFile === 'true',
        includeTranscript === 'true',
      )
      .pipe(
        map((res) => ({ result: res })),
        catchError(mapException),
      );
  }

  @Get()
  @ApiOperation({
    summary: 'List all meetings for the current user (Requires Auth)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'size', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'includeAudioFile',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiQuery({
    name: 'includeTranscript',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Paged meetings list retrieved successfully.',
  })
  findAll(
    @Query('page') page = '0',
    @Query('size') size = '10',
    @Query('includeAudioFile') includeAudioFile = 'false',
    @Query('includeTranscript') includeTranscript = 'false',
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.meetingsService
      .findAll(
        userId,
        parseInt(page, 10),
        parseInt(size, 10),
        includeAudioFile === 'true',
        includeTranscript === 'true',
      )
      .pipe(
        map((res) => ({ result: res })),
        catchError(mapException),
      );
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Update meeting title, description, or status (Requires Auth & Host/Editor)',
  })
  @ApiResponse({ status: 200, description: 'Meeting updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Meeting not found.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Req() req: any,
  ) {
    const requesterId = req.user.id;
    return this.meetingsService.update(id, dto, requesterId).pipe(
      map((res) => ({ result: res })),
      catchError(mapException),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a meeting (Requires Auth & Host)' })
  @ApiResponse({ status: 200, description: 'Meeting deleted successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Meeting not found.' })
  remove(@Param('id') id: string, @Req() req: any) {
    const requesterId = req.user.id;
    return this.meetingsService.remove(id, requesterId).pipe(
      map((res) => ({ result: res.message })),
      catchError(mapException),
    );
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'Get all members of a meeting (Requires Auth & Membership)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of members successfully retrieved.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  getMembers(@Param('id') id: string, @Req() req: any) {
    const requesterId = req.user.id;
    return this.meetingsService.getMembers(id, requesterId).pipe(
      map((res) => ({ result: res })),
      catchError(mapException),
    );
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a meeting (Requires Auth & Host)' })
  @ApiResponse({ status: 200, description: 'Member added successfully.' })
  @ApiResponse({ status: 400, description: 'User already a member.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Req() req: any,
  ) {
    const requesterId = req.user.id;
    return this.meetingsService.addMember(id, dto, requesterId).pipe(
      map((res) => ({ result: res })),
      catchError(mapException),
    );
  }

  @Put(':id/members/:userId')
  @ApiOperation({ summary: 'Update a member role (Requires Auth & Host)' })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid role update.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() dto: UpdateMemberDto,
    @Req() req: any,
  ) {
    const requesterId = req.user.id;
    return this.meetingsService
      .updateMemberRole(id, targetUserId, dto, requesterId)
      .pipe(
        map((res) => ({ result: res })),
        catchError(mapException),
      );
  }

  @Delete(':id/members/:userId')
  @ApiOperation({
    summary:
      'Remove a member from a meeting or leave (Requires Auth & Host or Self)',
  })
  @ApiResponse({ status: 200, description: 'Member removed successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid member removal.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  removeMember(
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Req() req: any,
  ) {
    const requesterId = req.user.id;
    return this.meetingsService
      .removeMember(id, targetUserId, requesterId)
      .pipe(
        map((res) => ({ result: res.message })),
        catchError(mapException),
      );
  }
}
