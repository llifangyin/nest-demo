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
        host: '127.0.0.1',
        port: PRODUCT_SERVICE_PORT,
      },
    },
  );
  await app.listen();
  console.log(`Product service is listening on port ${PRODUCT_SERVICE_PORT}`);

}
bootstrap();
