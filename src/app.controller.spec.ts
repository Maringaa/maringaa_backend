import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MaringaStore } from './store';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      login: jest.fn().mockResolvedValue({ success: true, token: 'mock' }),
    };
    const mockMaringaStore = {
      idempotencyRepo: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockResolvedValue({}),
      },
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
        { provide: MaringaStore, useValue: mockMaringaStore },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('auth/login', () => {
    it('should call login service', async () => {
      const result = await appController.login({ email: 'chidi@wholesale.ng' });
      expect(result).toEqual({ success: true, token: 'mock' });
      expect(appService.login).toHaveBeenCalledWith('chidi@wholesale.ng');
    });
  });
});
