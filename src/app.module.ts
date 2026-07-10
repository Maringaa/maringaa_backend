import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MaringaStore } from './store';
import { EventsGateway } from './events.gateway';
import * as entities from './entities';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'maringa_user',
      password: process.env.DB_PASSWORD || 'maringa_password',
      database: process.env.DB_DATABASE || 'maringa_dev',
      entities: Object.values(entities),
      synchronize: process.env.DB_SYNCHRONIZE === 'true' || true,
    }),
    TypeOrmModule.forFeature(Object.values(entities)),
  ],
  controllers: [AppController],
  providers: [AppService, MaringaStore, EventsGateway],
})
export class AppModule {}
