import { NestFactory } from '@nestjs/core';
import { UserServiceModule } from './user-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { USER_SERVICE_PORT } from '@app/common/constants';

//  用户服务式TCP微服务，监听3001端口，等待网关转发过来的请求，处理完后将结果返回给网关。网关再将结果返回给客户端。
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '127.0.0.1',
        port: USER_SERVICE_PORT,
      },
    },
  );
  await app.listen();
  console.log(`User service is listening on port ${USER_SERVICE_PORT}`);
}

bootstrap();
