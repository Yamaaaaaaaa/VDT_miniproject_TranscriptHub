import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';
import { TranscriptsService } from './transcripts.service';

@ApiTags('Transcripts')
@Controller('transcripts')
@UseGuards(JwtIdentityGuard)
@ApiBearerAuth()
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Get('file/:audioFileId')
  @ApiOperation({ summary: 'Get transcript by audio file ID' })
  getTranscriptByAudioFile(@Param('audioFileId') audioFileId: string) {
    return this.transcriptsService.getTranscriptByAudioFile(audioFileId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all transcripts' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'size', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  getAllTranscripts(
    @Query('page') page = '0',
    @Query('size') size = '10',
    @Query('search') search?: string,
  ) {
    return this.transcriptsService.getAllTranscripts(
      parseInt(page, 10),
      parseInt(size, 10),
      search,
    );
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate transcript manually' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileId'],
      properties: {
        fileId: {
          type: 'string',
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  generateTranscript(@Body('fileId') fileId: string) {
    if (!fileId) {
      throw new HttpException('fileId is required', HttpStatus.BAD_REQUEST);
    }
    return this.transcriptsService.generateTranscriptManual(fileId);
  }

  @Post('re-transcribe')
  @ApiOperation({ summary: 'Force re-run AI transcription (reset & re-process even if COMPLETED)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileId'],
      properties: {
        fileId: {
          type: 'string',
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  reTranscribe(@Body('fileId') fileId: string) {
    if (!fileId) {
      throw new HttpException('fileId is required', HttpStatus.BAD_REQUEST);
    }
    return this.transcriptsService.reTranscript(fileId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete transcript by ID' })
  deleteTranscript(@Param('id', ParseIntPipe) id: number) {
    return this.transcriptsService.deleteTranscript(id);
  }
}
