import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class FileGateway {
  constructor(
    @Inject('FILES_CLIENT') private readonly fileClient: ClientProxy,
  ) {}

  async checkFileExists(fileId: string): Promise<boolean> {
    return lastValueFrom(this.fileClient.send('check_file_exists', fileId));
  }

  async getFileMetadata(fileId: string) {
    return lastValueFrom(this.fileClient.send('get_file_metadata', fileId));
  }

  async searchFiles(search: string, uploaderId?: number): Promise<any[]> {
    return lastValueFrom(this.fileClient.send('search_files', { search, uploaderId }));
  }
}
