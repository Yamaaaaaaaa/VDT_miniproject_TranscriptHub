import { Test, TestingModule } from '@nestjs/testing';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { PrismaService } from './prisma/prisma.service';

describe('FileController', () => {
  let fileController: FileController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        FileService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    fileController = app.get<FileController>(FileController);
  });

  it('should be defined', () => {
    expect(fileController).toBeDefined();
  });
});
