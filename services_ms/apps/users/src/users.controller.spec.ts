import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let usersController: UsersController;
  let usersService: UsersService;

  beforeEach(async () => {
    const mockUsersService = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    usersController = app.get<UsersController>(UsersController);
    usersService = app.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should return all profiles', async () => {
      const result = await usersController.findAll();
      expect(result).toEqual([]);
      expect(usersService.findAll).toHaveBeenCalled();
    });
  });
});
