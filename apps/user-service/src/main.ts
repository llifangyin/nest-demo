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

  const green = '\x1b[32m';
  const reset = '\x1b[0m';
  const bold  = '\x1b[1m';

  console.log(`
${green}${bold}╔════════════════════════════════════════╗
║          USER SERVICE  ONLINE          ║
╚════════════════════════════════════════╝${reset}
${green}  ► 传输    : TCP
  ► 端口    : ${USER_SERVICE_PORT}
  ► 职责    : 用户 CRUD + 密码验证${reset}
`);
}

bootstrap();
