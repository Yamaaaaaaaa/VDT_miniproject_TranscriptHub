import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FileModule } from './../src/file.module';

describe('FileController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FileModule],
    })
      .overrideProvider('KAFKA_CLIENT')
      .useValue({
        emit: jest.fn(),
        send: jest.fn(),
        connect: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(null),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should compile and initialize', () => {
    expect(app).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
