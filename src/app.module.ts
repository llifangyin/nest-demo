import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.modules';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局应用 JwtAuthGuard，所有路由默认需要登录
    // 公开路由加 @Public() 装饰器即可跳过验证
    // APP_GUARD 是 NestJS 提供的一个特殊令牌，用于注册全局守卫。
  // 通过将 JwtAuthGuard 提供为 APP_GUARD，我们告诉 NestJS 在处理每个请求时都要使用 JwtAuthGuard 来进行身份验证。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
