import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';
import { CollabService } from './collab.service';
import {
  SaveTranscriptDto,
  CreateSnapshotDto,
  GetVersionsDto,
  RestoreVersionDto,
} from './dto/collab.dto';

@ApiTags('Collab')
@ApiBearerAuth()
@UseGuards(JwtIdentityGuard)
@Controller('v1/collab')
export class CollabController {
  constructor(private readonly collabService: CollabService) {}

  @Post('transcript')
  @ApiOperation({ summary: 'Save transcript (auto-save/manual-save)' })
  @ApiResponse({ status: 200, description: 'Transcript saved successfully.' })
  @ApiResponse({ status: 404, description: 'Meeting not found.' })
  saveTranscript(@Body() dto: SaveTranscriptDto, @Req() req: any) {
    const userId = req.user.id;
    return this.collabService.saveTranscript(
      dto.meetingId,
      dto.rawText,
      dto.structuredContent,
    );
  }

  @Post('snapshot')
  @ApiOperation({ summary: 'Create a snapshot (manual save version)' })
  @ApiResponse({ status: 200, description: 'Snapshot created successfully.' })
  @ApiResponse({ status: 404, description: 'Meeting or transcript not found.' })
  createSnapshot(@Body() dto: CreateSnapshotDto, @Req() req: any) {
    const userId = req.user.id;
    return this.collabService.createSnapshot(
      dto.meetingId,
      userId,
      dto.versionName,
    );
  }

  @Get(':meetingId/versions')
  @ApiOperation({ summary: 'Get all versions of a transcript' })
  @ApiResponse({ status: 200, description: 'List of versions.' })
  @ApiResponse({ status: 404, description: 'Meeting not found.' })
  getVersions(@Param('meetingId') meetingId: string, @Req() req: any) {
    return this.collabService.getVersions(meetingId);
  }

  @Post('restore')
  @ApiOperation({ summary: 'Restore transcript to a specific version' })
  @ApiResponse({ status: 200, description: 'Version restored successfully.' })
  @ApiResponse({ status: 404, description: 'Meeting or version not found.' })
  restoreVersion(@Body() dto: RestoreVersionDto, @Req() req: any) {
    return this.collabService.restoreVersion(dto.meetingId, dto.versionId);
  }
}
