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

  const magenta = '\x1b[35m';
  const reset   = '\x1b[0m';
  const bold    = '\x1b[1m';

  console.log(`
${magenta}${bold}╔════════════════════════════════════════╗
║         EXPORT WORKER  ONLINE          ║
╚════════════════════════════════════════╝${reset}
${magenta}  ► 传输    : RabbitMQ
  ► 队列    : ${EXPORT_QUEUE}
  ► 职责    : 异步导出 CSV 文件${reset}
`);
}
bootstrap();