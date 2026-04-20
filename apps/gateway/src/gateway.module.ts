import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  USER_SERVICE,
  PRODUCT_SERVICE,
  USER_SERVICE_PORT,
  PRODUCT_SERVICE_PORT,
} from '@app/common';
import { UsersController } from './controllers/users.controller';
import { ProductsController } from './controllers/products.controller';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExportTask,
  ExportTaskSchema,
  EXPORT_SERVICE,
  EXPORT_QUEUE,
} from '@app/common';
import { ExportController } from './controllers/export.controller';
import { ExportService } from './services/export.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),// 让 ConfigService 在整个应用中都可用
    PassportModule,// 注册 PassportModule，这样我们就可以在 AuthService 中使用 @InjectPassport() 来注入 Passport 实例了。
    JwtModule.registerAsync({// 异步注册 JwtModule，这样我们就可以从 ConfigService 中获取 JWT_SECRET 和 JWT_EXPIRES_IN 等配置项了。
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d')! as any },
      }),
    }),

    // 注册微服务客户端-告诉网关怎么连接到各个服务
    ClientsModule.register([
      {
        name: USER_SERVICE,
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: USER_SERVICE_PORT,
        },
      },
      {
        name: PRODUCT_SERVICE,
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: PRODUCT_SERVICE_PORT,
        },
      },
    ]),
    MongooseModule.forRootAsync({// 异步连接 MongoDB，确保 .env 加载完毕后再连接数据库
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([{ name: ExportTask.name, schema: ExportTaskSchema }]),// 注册 ExportTask 模型，这样我们就可以在 ExportService 中使用 @InjectModel(ExportTask.name) 来注入这个模型了。

    ClientsModule.registerAsync([
      {
        name: EXPORT_SERVICE,
        inject: [ConfigService],
        useFactory: async (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL')!],
            queue: EXPORT_QUEUE,  
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [UsersController, ProductsController, AuthController, ExportController],
  providers: [
    AuthService,
    ExportService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // 全局应用 JwtAuthGuard，所有路由默认需要登录，公开路由加 @Public() 装饰器即可跳过验证],
  ],
})
export class GatewayModule {}
