import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  User, UserSchema,
  ExportTask, ExportTaskSchema,
} from '@app/common';
import { ExportProcessor } from './export.processor';
import { UserDao } from './dao/user.dao';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ExportProcessor],
  providers: [UserDao],
})
export class ExportWorkerModule {}