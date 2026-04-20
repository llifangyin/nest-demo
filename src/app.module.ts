import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.modules';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ExportModule } from './export/export.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    // isGlobal: true 让所有模块都能用 ConfigService，不需要每个模块单独 import
    ConfigModule.forRoot({ isGlobal: true }),
    // forRootAsync 异步读取配置，确保 .env 加载完毕后再连接数据库
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    // 异步注册 CacheModule，使用 Redis 作为缓存存储
    CacheModule.registerAsync({
      isGlobal: true, // 全局可用
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        // cache-manager-ioredis-yet 无类型声明，通过函数签名断言调用
        const { redisStore } = await import('cache-manager-ioredis-yet');
        const store = await (
          redisStore as (opts: Record<string, unknown>) => Promise<unknown>
        )({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        });
        return { store, ttl: 60 * 1000 /* 默认缓存时间 1 分钟 */ };
      },
    }),
    ExportModule,
    ProductsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局应用 JwtAuthGuard，所有路由默认需要登录
    // 公开路由加 @Public() 装饰器即可跳过验证
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
