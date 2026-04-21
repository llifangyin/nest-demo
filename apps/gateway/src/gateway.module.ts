import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import {
  USER_SERVICE,
  PRODUCT_SERVICE,
  USER_SERVICE_PORT,
  PRODUCT_SERVICE_PORT,
  ExportTask,
  ExportTaskSchema,
  EXPORT_SERVICE,
  EXPORT_QUEUE,
} from '@app/common';
import { UsersController } from './controllers/users.controller';
import { ProductsController } from './controllers/products.controller';
import { AuthController } from './controllers/auth.controller';
import { ExportController } from './controllers/export.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ExportService } from './services/export.service';
import { HealthModule } from './health/health.module';
import { RpcExceptionFilter } from './filters/rpc-exception.filter';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor'; // 加这行
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule, // JWT 模块配置，使用异步方式从 ConfigService 获取配置项
    JwtModule.registerAsync({
      // JWT 模块配置，使用异步方式从 ConfigService 获取配置项
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') as any,
        },
      }),
    }),

    // 限流
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 3 },
        { name: 'long', ttl: 60000, limit: 60 },
      ],
    }),

    // TCP 微服务客户端
    // 从环境变量读取 host（本地默认 localhost，Docker 里注入服务名）
    ClientsModule.registerAsync([
      {
        name: USER_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('USER_SERVICE_HOST', 'localhost'),
            port: USER_SERVICE_PORT,
          },
        }),
      },
      {
        name: PRODUCT_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PRODUCT_SERVICE_HOST', 'localhost'),
            port: PRODUCT_SERVICE_PORT,
          },
        }),
      },
    ]),
    // ClientsModule.register([
    //   {
    //     name: USER_SERVICE,
    //     transport: Transport.TCP,
    //     options: {
    //       host: 'localhost',
    //       port: USER_SERVICE_PORT,
    //     },
    //   },
    //   {
    //     name: PRODUCT_SERVICE,
    //     transport: Transport.TCP,
    //     options: {
    //       host: 'localhost',
    //       port: PRODUCT_SERVICE_PORT,
    //     },
    //   },
    // ]),
    // MongoDB 配置，使用异步方式从 ConfigService 获取连接 URI
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    // 导出任务模型注册
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
    ]),
    // RabbitMQ 微服务客户端，使用异步方式从 ConfigService 获取连接配置
    ClientsModule.registerAsync([
      {
        name: EXPORT_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL')!],
            queue: EXPORT_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),

    // 健康检查
    HealthModule,
  ],
  // 控制器配置
  controllers: [
    UsersController,
    ProductsController,
    AuthController,
    ExportController,
  ],
  // 认证相关 providers 和全局守卫、过滤器、拦截器 配置
  providers: [
    AuthService,
    ExportService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: RpcExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(5000),
    },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class GatewayModule {}
