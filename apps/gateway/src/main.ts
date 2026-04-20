import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';

// 网关是**唯一对外暴露 HTTP 的服务**，负责：
// 1. 接收前端 HTTP 请求
// 2. 转发给对应的微服务（TCP）
// 3. JWT 鉴权（认证逻辑放在网关）
async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();// 允许跨域请求
  //全局使用 ValidationPipe，并启用 whitelist 选项，自动过滤掉 DTO 中未定义的属性
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.port ?? 3000);
  console.log(`Gateway is listening on port ${process.env.port ?? 3000}`);
}
bootstrap();
