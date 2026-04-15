import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //允许前端跨域访问
  app.enableCors();
  //全局DTO校验
  app.useGlobalPipes( new ValidationPipe({
      whitelist: true, //自动去除DTO中没有的属性
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
