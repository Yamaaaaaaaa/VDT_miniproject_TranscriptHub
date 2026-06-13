import {
    Controller, Get, Post, Put, Delete, Body, Param, Query,
    Headers, UploadedFile, UseInterceptors, Res, Req,
    BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagePattern } from '@nestjs/microservices';
import { FileService } from './file.service';
import { UploadInitDto } from './dto/upload-init.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import * as express from 'express';

@Controller('api/v1/files')
export class FileController {
    constructor(private readonly fileService: FileService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadSingleFile(
        @Headers('x-user-id') uploaderId: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const audioFile = await this.fileService.uploadSingleFile(file, parseInt(uploaderId, 10));
        return { result: this.mapToResponse(audioFile) };
    }

    @Post('upload/init')
    async initializeUpload(
        @Headers('x-user-id') uploaderId: string,
        @Body() dto: UploadInitDto,
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const initResponse = await this.fileService.initializeUpload(dto, parseInt(uploaderId, 10));
        return { result: initResponse };
    }

    @Post('upload/complete/:fileId')
    async completeUpload(
        @Headers('x-user-id') uploaderId: string,
        @Param('fileId') fileId: string,
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const audioFile = await this.fileService.completeUpload(fileId, parseInt(uploaderId, 10));
        return { result: this.mapToResponse(audioFile) };
    }

    @Get('stream/:fileId')
    async streamAudio(
        @Param('fileId') fileId: string,
        @Req() req: express.Request,
        @Res() res: express.Response,
    ) {
        const rangeHeader = req.headers.range;
        return this.fileService.streamAudio(fileId, rangeHeader, res);
    }

    @Get('internal/exists/:fileId')
    async checkFileExists(@Param('fileId') fileId: string) {
        const exists = await this.fileService.checkFileExists(fileId);
        return { result: exists };
    }

    @Get(':fileId')
    async getMetadata(@Param('fileId') fileId: string) {
        const audioFile = await this.fileService.getMetadata(fileId);
        return { result: this.mapToResponse(audioFile) };
    }

    @Delete(':fileId')
    async deleteFile(
        @Headers('x-user-id') uploaderId: string,
        @Param('fileId') fileId: string,
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const response = await this.fileService.deleteFile(fileId, parseInt(uploaderId, 10));
        return { result: response.message };
    }

    @Put(':fileId')
    async updateMetadata(
        @Headers('x-user-id') uploaderId: string,
        @Param('fileId') fileId: string,
        @Body() dto: UpdateFileDto,
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const audioFile = await this.fileService.updateMetadata(fileId, dto.fileName, parseInt(uploaderId, 10));
        return { result: this.mapToResponse(audioFile) };
    }

    @Get()
    async listFiles(
        @Headers('x-user-id') uploaderId: string,
        @Query('page') page = '0',
        @Query('size') size = '10',
    ) {
        if (!uploaderId) throw new BadRequestException('X-User-Id header is missing');
        const response = await this.fileService.listFiles(
            parseInt(uploaderId, 10),
            parseInt(page, 10),
            parseInt(size, 10),
        );
        return {
            result: {
                content: response.items.map(item => this.mapToResponse(item)),
                totalElements: response.total,
                pageNumber: response.page,
                pageSize: response.size,
                totalPages: response.totalPages,
            }
        };
    }

    private mapToResponse(file: any) {
        return {
            id: file.id,
            fileName: file.fileName,
            bucketName: file.bucketName,
            objectKey: file.objectKey,
            fileSize: file.fileSize.toString(), // Convert BigInt to string for JSON serialization
            mimeType: file.mimeType,
            durationSeconds: file.durationSeconds,
            status: file.status,
            uploaderId: file.uploaderId,
            createdAt: file.createdAt,
        };
    }

    @MessagePattern('get_file_metadata')
    async getMetadataTcp(fileId: string) {
        const audioFile = await this.fileService.getMetadata(fileId);
        return this.mapToResponse(audioFile);
    }

    @MessagePattern('update_file_metadata')
    async updateMetadataTcp(data: { fileId: string; fileName: string; uploaderId: number }) {
        const audioFile = await this.fileService.updateMetadata(data.fileId, data.fileName, data.uploaderId);
        return this.mapToResponse(audioFile);
    }

    @MessagePattern('delete_file')
    async deleteFileTcp(data: { fileId: string; uploaderId: number }) {
        const response = await this.fileService.deleteFile(data.fileId, data.uploaderId);
        return { result: response.message };
    }

    @MessagePattern('list_files')
    async listFilesTcp(data: { uploaderId: number; page: number; size: number }) {
        const response = await this.fileService.listFiles(data.uploaderId, data.page, data.size);
        return {
            content: response.items.map(item => this.mapToResponse(item)),
            totalElements: response.total,
            pageNumber: response.page,
            pageSize: response.size,
            totalPages: response.totalPages,
        };
    }

    @MessagePattern('check_file_exists')
    async checkFileExistsTcp(fileId: string) {
        return await this.fileService.checkFileExists(fileId);
    }
}
