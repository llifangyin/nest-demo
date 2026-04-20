import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ExportWorkerModule } from './export-worker.module';
import { EXPORT_QUEUE } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ExportWorkerModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ?? 'amqp://admin:Password01!@localhost:5672',
        ],
        queue: EXPORT_QUEUE,
        queueOptions: { durable: true },
      },
    },
  );
  await app.listen();
  console.log('Export Worker 已启动，等待消息...');
}
bootstrap()