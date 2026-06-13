import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, catchError, throwError } from 'rxjs';

@Injectable()
export class FilesService {
    constructor(
        @Inject('FILES_CLIENT') private readonly filesClient: ClientProxy,
    ) { }

    getMetadata(fileId: string): Observable<any> {
        return this.filesClient
            .send('get_file_metadata', fileId)
            .pipe(catchError((err) => throwError(() => err)));
    }

    updateMetadata(fileId: string, fileName: string, uploaderId: number): Observable<any> {
        return this.filesClient
            .send('update_file_metadata', { fileId, fileName, uploaderId })
            .pipe(catchError((err) => throwError(() => err)));
    }

    deleteFile(fileId: string, uploaderId: number): Observable<any> {
        return this.filesClient
            .send('delete_file', { fileId, uploaderId })
            .pipe(catchError((err) => throwError(() => err)));
    }

    listFiles(uploaderId: number, page: number, size: number): Observable<any> {
        return this.filesClient
            .send('list_files', { uploaderId, page, size })
            .pipe(catchError((err) => throwError(() => err)));
    }
}
