import { Test, TestingModule } from '@nestjs/testing';
import { FileController } from './file.controller';
import { FileService } from './file.service';

describe('FileController', () => {
  let fileController: FileController;

  beforeEach(async () => {
    const mockFileService = {
      initializeUpload: jest.fn(),
      completeUpload: jest.fn(),
      uploadSingleFile: jest.fn(),
      streamAudio: jest.fn(),
      getMetadata: jest.fn(),
      updateMetadata: jest.fn(),
      deleteFile: jest.fn(),
      listFiles: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        {
          provide: FileService,
          useValue: mockFileService,
        },
      ],
    }).compile();

    fileController = app.get<FileController>(FileController);
  });

  it('should be defined', () => {
    expect(fileController).toBeDefined();
  });
});
