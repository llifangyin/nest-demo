import { NestFactory } from '@nestjs/core';
import { ProductServiceModule } from './product-service.module';
import{ MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PRODUCT_SERVICE_PORT } from '@app/common/constants'; 



async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ProductServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0', // 监听所有地址，允许外部访问
        port: PRODUCT_SERVICE_PORT,
      },
    },
  );
  await app.listen();

  const yellow = '\x1b[33m';
  const reset  = '\x1b[0m';
  const bold   = '\x1b[1m';

  console.log(`
${yellow}${bold}╔════════════════════════════════════════╗
║        PRODUCT SERVICE  ONLINE         ║
╚════════════════════════════════════════╝${reset}
${yellow}  ► 传输    : TCP
  ► 端口    : ${PRODUCT_SERVICE_PORT}
  ► 职责    : 商品 CRUD${reset}
`);
}
bootstrap();
