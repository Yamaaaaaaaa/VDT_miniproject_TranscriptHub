import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { catchError, throwError } from 'rxjs';
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
    return this.transcriptsService.getTranscriptByAudioFile(audioFileId).pipe(
      catchError((err) => {
        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        const message = err?.message || 'Failed to retrieve transcript';
        if (message.includes('not found') || message.includes('NotFound')) {
          status = HttpStatus.NOT_FOUND;
        }
        return throwError(() => new HttpException(message, status));
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all transcripts' })
  getAllTranscripts() {
    return this.transcriptsService.getAllTranscripts().pipe(
      catchError((err) => {
        const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = err?.message || 'Failed to retrieve transcripts';
        return throwError(() => new HttpException(message, status));
      }),
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
    return this.transcriptsService.generateTranscriptManual(fileId).pipe(
      catchError((err) => {
        const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = err?.message || 'Failed to generate transcript';
        return throwError(() => new HttpException(message, status));
      }),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete transcript by ID' })
  deleteTranscript(@Param('id', ParseIntPipe) id: number) {
    return this.transcriptsService.deleteTranscript(id).pipe(
      catchError((err) => {
        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        const message = err?.message || 'Failed to delete transcript';
        if (message.includes('not found') || message.includes('NotFound')) {
          status = HttpStatus.NOT_FOUND;
        }
        return throwError(() => new HttpException(message, status));
      }),
    );
  }
}
