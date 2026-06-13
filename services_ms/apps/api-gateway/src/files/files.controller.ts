import {
    Controller, Get, Post, Put, Delete, Req, Res, UseGuards,
    Param, Body, Query, HttpException, HttpStatus
} from '@nestjs/common';
import {
    ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery
} from '@nestjs/swagger';
import * as express from 'express';
import * as http from 'http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { JwtIdentityGuard } from '../identity/guards/jwt-identity.guard';
import { FilesService } from './files.service';

@ApiTags('Files')
@Controller('files')
export class FilesController {
    private readonly fileServiceUrl = `http://${process.env.FILE_SERVICE_HOST || 'localhost'}:${process.env.FILE_SERVICE_PORT || '3003'}`;

    constructor(private readonly filesService: FilesService) { }

    private doProxy(req: express.Request, res: express.Response, customPath?: string) {
        const rawPath = customPath || req.url;
        // Strip the gateway prefixes /api/files or /files from the path
        const cleanPath = rawPath.replace(/^\/(api\/)?files/, '');
        const targetUrl = `${this.fileServiceUrl}/api/v1/files${cleanPath}`;
        
        const userId = (req as any).user?.id;
        const headers = { ...req.headers };
        if (userId) {
            headers['x-user-id'] = String(userId);
        }
        
        delete headers['host'];

        const parsedUrl = new URL(targetUrl);
        const options: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: headers,
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy request to File Service failed:', err);
            if (!res.headersSent) {
                res.status(502).send('Bad Gateway');
            }
        });

        req.pipe(proxyReq);
    }

    @Post('upload')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload a file directly (Single-step)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    uploadSingle(@Req() req: express.Request, @Res() res: express.Response) {
        this.doProxy(req, res);
    }

    @Post('upload/init')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Initialize an upload with a Presigned URL' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['fileName', 'fileSize', 'mimeType'],
            properties: {
                fileName: { type: 'string', example: 'podcast.mp3' },
                fileSize: { type: 'number', example: 10485760 },
                mimeType: { type: 'string', example: 'audio/mpeg' },
            },
        },
    })
    initializeUpload(@Req() req: express.Request, @Res() res: express.Response) {
        this.doProxy(req, res);
    }

    @Post('upload/complete/:fileId')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Complete a presigned upload and extract audio metadata' })
    completeUpload(
        @Param('fileId') fileId: string,
        @Req() req: express.Request,
        @Res() res: express.Response,
    ) {
        this.doProxy(req, res);
    }

    @Get('stream/:fileId')
    @ApiOperation({ summary: 'Stream an audio file (Supports Seeking / Range Requests)' })
    streamAudio(
        @Param('fileId') fileId: string,
        @Req() req: express.Request,
        @Res() res: express.Response,
    ) {
        this.doProxy(req, res);
    }

    @Get(':fileId')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get file metadata by ID' })
    getMetadata(@Param('fileId') fileId: string) {
        return this.filesService.getMetadata(fileId).pipe(
            catchError((err) => {
                const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
                const message = err?.message || 'Failed to retrieve metadata';
                return throwError(() => new HttpException(message, status));
            })
        );
    }

    @Put(':fileId')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update file name' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['fileName'],
            properties: {
                fileName: { type: 'string', example: 'new-name.mp3' },
            },
        },
    })
    updateMetadata(
        @Param('fileId') fileId: string,
        @Body('fileName') fileName: string,
        @Req() req: any,
    ) {
        const uploaderId = req.user?.id;
        if (!uploaderId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
        return this.filesService.updateMetadata(fileId, fileName, uploaderId).pipe(
            catchError((err) => {
                const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
                const message = err?.message || 'Failed to update metadata';
                return throwError(() => new HttpException(message, status));
            })
        );
    }

    @Delete(':fileId')
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete file from storage and database' })
    deleteFile(@Param('fileId') fileId: string, @Req() req: any) {
        const uploaderId = req.user?.id;
        if (!uploaderId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
        return this.filesService.deleteFile(fileId, uploaderId).pipe(
            catchError((err) => {
                const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
                const message = err?.message || 'Failed to delete file';
                return throwError(() => new HttpException(message, status));
            })
        );
    }

    @Get()
    @UseGuards(JwtIdentityGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'List all uploaded files with pagination' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 0 })
    @ApiQuery({ name: 'size', required: false, type: Number, example: 10 })
    listFiles(
        @Query('page') page = '0',
        @Query('size') size = '10',
        @Req() req: any,
    ) {
        const uploaderId = req.user?.id;
        if (!uploaderId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
        return this.filesService.listFiles(
            uploaderId,
            parseInt(page, 10),
            parseInt(size, 10),
        ).pipe(
            catchError((err) => {
                const status = err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
                const message = err?.message || 'Failed to list files';
                return throwError(() => new HttpException(message, status));
            })
        );
    }
}
