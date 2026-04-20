import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Product, ProductSchema } from '@app/common';
import { ProductsController } from './product-service.controller';
import { ProductsService } from './product-service.service';
import { ProductDao } from './dao/product.dao';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // 让 ConfigService 在整个应用中都可用
    MongooseModule.forRootAsync({// 异步注册 MongooseModule，确保 .env 加载完毕后再连接数据库
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductDao],
})
export class ProductServiceModule {}
