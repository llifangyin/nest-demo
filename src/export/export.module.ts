import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { ExportProcessor } from './export.processor';
import { ExportTask, ExportTaskSchema } from './schemas/export-task.schema';
import { UsersModule } from '../users/users.modules';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
    ]),
    // 注册 RabbitMQ 客户端，EXPORT_SERVICE 供 ExportService 注入使用
    ClientsModule.registerAsync([
      {
        name: 'EXPORT_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL')!],
            queue: 'export_queue',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
    UsersModule,
  ],
  controllers: [ExportController, ExportProcessor],
  providers: [ExportService],
})
export class ExportModule {}
