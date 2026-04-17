import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 连接 RabbitMQ 微服务，监听导出任务的结果
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [
        process.env.RABBITMQ_URL ?? 'amqp://admin:Password01!@localhost:5672',
      ],
      queue: 'export_queue',
      queueOptions: {
        durable: true, // 队列持久化，RabbitMQ 重启后队列不会丢失，适合生产环境
      },
    },
  });
  await app.startAllMicroservices(); // 启动微服务监听

  app.enableCors(); //允许前端跨域访问

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //自动去除DTO中没有的属性
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
