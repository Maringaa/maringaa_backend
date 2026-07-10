import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { MaringaStore } from './../src/store';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
        { provide: MaringaStore, useValue: mockMaringaStore },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/v1/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'chidi@wholesale.ng' })
      .expect(201)
      .expect({ success: true, token: 'mock' });
  });

  afterEach(async () => {
    await app.close();
  });
});
