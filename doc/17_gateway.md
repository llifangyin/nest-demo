# 17. API 网关进阶 — 限流、超时、健康检查、统一异常与日志

> **前置知识**：你已经完成 [16_microservice.md](./16_microservice.md)，网关能正常转发请求到各微服务。
> **目标**：给网关加上生产级能力 —— 限流保护、超时兜底、健康检查、统一异常处理、请求日志追踪。

---

## 目录

1. [为什么需要这些](#1-为什么需要这些)
2. [改造总览 — 加什么、改哪里](#2-改造总览--加什么改哪里)
3. [第一步：统一异常处理 — RPC 错误转 HTTP](#3-第一步统一异常处理--rpc-错误转-http)
4. [第二步：超时处理 — 防止请求挂死](#4-第二步超时处理--防止请求挂死)
5. [第三步：限流 — 防止接口被刷](#5-第三步限流--防止接口被刷)
6. [第四步：健康检查 — 服务是否活着](#6-第四步健康检查--服务是否活着)
7. [第五步：请求日志 — 追踪每个请求](#7-第五步请求日志--追踪每个请求)
8. [第六步：统一响应格式](#8-第六步统一响应格式)
9. [完整改动清单](#9-完整改动清单)
10. [常见问题](#10-常见问题)

---

## 1. 为什么需要这些

16 章搭好了网关骨架，但还有几个"生产环境一定会遇到"的问题：

| 问题 | 现象 | 后果 |
|------|------|------|
| 微服务挂了 | `firstValueFrom()` 永远等不到响应 | 前端请求一直转圈，最后浏览器超时 |
| 没有限流 | 有人恶意刷接口 | 服务被打垮，正常用户也用不了 |
| 没有健康检查 | 不知道哪个服务挂了 | 出问题了只能猜 |
| 微服务抛异常 | RPC 错误直接透传到前端 | 前端收到 500 + 一堆看不懂的内部错误 |
| 没有请求日志 | 不知道谁在什么时候调了什么接口 | 排查问题靠猜 |

### 类比前端

```
统一异常处理 = axios 的 response interceptor，统一处理 4xx/5xx
超时处理     = axios.defaults.timeout = 5000
限流         = 按钮防抖/节流，但在服务端做
健康检查     = 前端的 /health 页面，CI 用来判断部署是否成功
请求日志     = console.log 每个 API 请求（但用专业的 Logger）
```

---

## 2. 改造总览 — 加什么、改哪里

### 新增文件

| 文件 | 作用 |
|------|------|
| `apps/gateway/src/filters/rpc-exception.filter.ts` | 捕获微服务异常，转为 HTTP 响应 |
| `apps/gateway/src/interceptors/timeout.interceptor.ts` | 给所有请求加超时 |
| `apps/gateway/src/interceptors/logging.interceptor.ts` | 记录每个请求的耗时和结果 |
| `apps/gateway/src/interceptors/transform.interceptor.ts` | 统一包装响应格式 |
| `apps/gateway/src/health/health.controller.ts` | 健康检查端点 |
| `apps/gateway/src/health/health.module.ts` | 健康检查模块 |

### 修改文件

| 文件 | 改什么 |
|------|--------|
| `apps/gateway/src/gateway.module.ts` | 引入 ThrottlerModule、HealthModule，注册全局 Filter/Interceptor |
| `apps/gateway/src/main.ts` | 不用改（全局组件通过 Module 注册） |
| `package.json` | 安装新依赖 |

### 需要安装的依赖

```bash
npm install @nestjs/throttler @nestjs/terminus
```

- `@nestjs/throttler`：NestJS 官方限流模块
- `@nestjs/terminus`：NestJS 官方健康检查模块

---

## 3. 第一步：统一异常处理 — RPC 错误转 HTTP

### 3.1 问题

当微服务抛出异常（比如找不到用户），错误会通过 TCP 传回网关。但默认情况下，NestJS 不知道怎么把 RPC 异常转成 HTTP 响应，前端可能收到：

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

而实际上应该是 404。

### 3.2 解决方案 — ExceptionFilter

```
微服务抛 RpcException → TCP 传回网关 → ExceptionFilter 捕获 → 转成 HttpException → 前端收到正确的状态码
```

### 3.3 代码

#### apps/gateway/src/filters/rpc-exception.filter.ts

```typescript
import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Response } from 'express';

/**
 * 捕获从微服务透传回来的 RpcException，转成 HTTP 响应
 *
 * 类比前端：相当于 axios interceptor 里 catch 后端返回的 error，
 * 然后根据 error.code 决定弹什么提示
 */
@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // RpcException.getError() 可以返回 string 或 object
    const rpcError = exception.getError();

    // 如果微服务返回的是结构化错误 { statusCode, message }
    if (typeof rpcError === 'object' && rpcError !== null) {
      const error = rpcError as { statusCode?: number; message?: string };
      const status = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        statusCode: status,
        message: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    } else {
      // 如果是普通字符串错误
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: rpcError || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

### 3.4 微服务端怎么抛异常

在 user-service / product-service 里，用 `RpcException` 代替 `HttpException`：

```typescript
// ❌ 微服务里不要用 HttpException（它是 HTTP 的概念）
throw new HttpException('User not found', 404);

// ✅ 用 RpcException，传结构化信息
import { RpcException } from '@nestjs/microservices';

throw new RpcException({ statusCode: 404, message: 'User not found' });
```

**示例 — user-service.controller.ts 的 findOne**：

```typescript
@MessagePattern({ cmd: 'find_one_user' })
async findOne(@Payload() data: { id: string }) {
  const user = await this.usersService.findOne(data.id);
  if (!user) {
    throw new RpcException({ statusCode: 404, message: '用户不存在' });
  }
  return user;
}
```

### 3.5 注册到 Module

在 `gateway.module.ts` 的 `providers` 里注册为全局 Filter：

```typescript
import { APP_FILTER } from '@nestjs/core';
import { RpcExceptionFilter } from './filters/rpc-exception.filter';

providers: [
  // ... 已有的 providers
  { provide: APP_FILTER, useClass: RpcExceptionFilter },
],
```

---

## 4. 第二步：超时处理 — 防止请求挂死

### 4.1 问题

如果 user-service 挂了，`this.userClient.send(...)` 返回的 Observable 永远不会 emit 值，`firstValueFrom()` 就永远等着。前端表现：请求一直 pending。

### 4.2 解决方案 — TimeoutInterceptor

用 RxJS 的 `timeout` 操作符，给所有请求加一个最大等待时间。

### 4.3 代码

#### apps/gateway/src/interceptors/timeout.interceptor.ts

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * 给所有请求加超时限制
 * 超过指定时间没返回，自动抛 408 Request Timeout
 *
 * 类比前端：axios.defaults.timeout = 5000
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 5000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('请求超时，下游服务未在规定时间内响应'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
```

### 4.4 注册到 Module

```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';

providers: [
  // ... 已有的 providers
  {
    provide: APP_INTERCEPTOR,
    useFactory: () => new TimeoutInterceptor(5000), // 5 秒超时
  },
],
```

### 4.5 效果

```
正常请求：user-service 200ms 内返回 → 正常响应
异常请求：user-service 挂了 → 5 秒后前端收到 408 Request Timeout
```

---

## 5. 第三步：限流 — 防止接口被刷

### 5.1 问题

没有限流，攻击者可以用脚本疯狂调你的接口，导致服务资源耗尽。

### 5.2 解决方案 — @nestjs/throttler

NestJS 官方的限流模块，基于内存或 Redis 存储，开箱即用。

### 5.3 安装

```bash
npm install @nestjs/throttler
```

### 5.4 代码

#### 在 gateway.module.ts 中注册

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // ... 已有的 imports
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',   // 短期限流：每秒最多 3 次
          ttl: 1000,       // 时间窗口 1 秒（毫秒）
          limit: 3,
        },
        {
          name: 'long',    // 长期限流：每分钟最多 60 次
          ttl: 60000,      // 时间窗口 60 秒
          limit: 60,
        },
      ],
    }),
  ],
  providers: [
    // ... 已有的 providers
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // 全局限流
  ],
})
```

### 5.5 自定义某些路由的限流

```typescript
import { Throttle, SkipThrottle } from '@nestjs/throttler';

// 登录接口更严格：每分钟最多 5 次（防暴力破解）
@Throttle({ short: { ttl: 60000, limit: 5 } })
@Post('login')
async login(@Body() body: { name: string; password: string }) { ... }

// 健康检查跳过限流
@SkipThrottle()
@Get('health')
healthCheck() { ... }
```

### 5.6 限流被触发时

前端会收到：

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

### 5.7 前端处理

```typescript
// Umi request 拦截器里加
if (response.status === 429) {
  message.warning('操作太频繁，请稍后再试');
}
```

---

## 6. 第四步：健康检查 — 服务是否活着

### 6.1 问题

4 个服务同时跑，怎么知道哪个挂了？需要一个 `/health` 端点，一个 HTTP 请求就能知道所有依赖的状态。

### 6.2 解决方案 — @nestjs/terminus

NestJS 官方的健康检查模块，支持检测数据库连接、微服务连接、内存/磁盘等。

### 6.3 安装

```bash
npm install @nestjs/terminus
```

### 6.4 代码

#### apps/gateway/src/health/health.controller.ts

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  MongooseHealthIndicator,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { USER_SERVICE_PORT, PRODUCT_SERVICE_PORT } from '@app/common';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private microservice: MicroserviceHealthIndicator,
  ) {}

  @Get()
  @Public()         // 健康检查不需要登录
  @SkipThrottle()   // 不受限流限制
  @HealthCheck()
  check() {
    return this.health.check([
      // 检查 MongoDB 连接
      () => this.mongoose.pingCheck('mongodb'),

      // 检查 user-service TCP 连接
      () =>
        this.microservice.pingCheck('user-service', {
          transport: Transport.TCP,
          options: { host: 'localhost', port: USER_SERVICE_PORT },
        }),

      // 检查 product-service TCP 连接
      () =>
        this.microservice.pingCheck('product-service', {
          transport: Transport.TCP,
          options: { host: 'localhost', port: PRODUCT_SERVICE_PORT },
        }),
    ]);
  }
}
```

#### apps/gateway/src/health/health.module.ts

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

### 6.5 在 gateway.module.ts 中引入

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ... 已有的 imports
    HealthModule,
  ],
})
```

### 6.6 测试

```bash
curl http://localhost:3000/health
```

**一切正常时**：

```json
{
  "status": "ok",
  "info": {
    "mongodb": { "status": "up" },
    "user-service": { "status": "up" },
    "product-service": { "status": "up" }
  },
  "error": {},
  "details": {
    "mongodb": { "status": "up" },
    "user-service": { "status": "up" },
    "product-service": { "status": "up" }
  }
}
```

**user-service 挂了时**：

```json
{
  "status": "error",
  "info": {
    "mongodb": { "status": "up" },
    "product-service": { "status": "up" }
  },
  "error": {
    "user-service": { "status": "down", "message": "connect ECONNREFUSED" }
  },
  "details": { ... }
}
```

HTTP 状态码也会变成 `503 Service Unavailable`。

---

## 7. 第五步：请求日志 — 追踪每个请求

### 7.1 问题

线上出了 bug，你需要知道：谁在什么时间调了什么接口，参数是什么，返回了什么，花了多久。

### 7.2 代码

#### apps/gateway/src/interceptors/logging.interceptor.ts

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';

/**
 * 全局请求日志拦截器
 * 记录每个请求的 方法、路径、耗时、状态码
 *
 * 类比前端：axios interceptor 里 console.log 每个请求
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - now;
          this.logger.log(`${method} ${url} → 200 +${ms}ms`);
        },
        error: (err) => {
          const ms = Date.now() - now;
          const status = err?.status || err?.statusCode || 500;
          this.logger.error(`${method} ${url} → ${status} +${ms}ms — ${err.message}`);
        },
      }),
    );
  }
}
```

### 7.3 注册到 Module

```typescript
import { LoggingInterceptor } from './interceptors/logging.interceptor';

providers: [
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
],
```

### 7.4 日志输出效果

```
[HTTP] GET /users → 200 +45ms
[HTTP] POST /auth/login → 200 +128ms
[HTTP] GET /products?name=手机 → 200 +32ms
[HTTP] GET /users/invalid-id → 404 +15ms — 用户不存在
[HTTP] GET /users → 408 +5003ms — 请求超时，下游服务未在规定时间内响应
```

---

## 8. 第六步：统一响应格式

### 8.1 问题

现在接口返回的格式不统一：有的直接返回数组，有的返回 `{ items, total }`。前端要针对每个接口写不同的解析逻辑。

### 8.2 代码

#### apps/gateway/src/interceptors/transform.interceptor.ts

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 统一包装响应格式为 { code, data, message }
 *
 * 类比前端：axios interceptor 里统一从 response.data 解包
 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        data,
        message: 'success',
      })),
    );
  }
}
```

### 8.3 注册到 Module

```typescript
import { TransformInterceptor } from './interceptors/transform.interceptor';

providers: [
  { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
],
```

### 8.4 效果

**改造前**：

```json
[
  { "_id": "abc", "name": "张三", "email": "zhangsan@test.com" }
]
```

**改造后**：

```json
{
  "code": 0,
  "data": [
    { "_id": "abc", "name": "张三", "email": "zhangsan@test.com" }
  ],
  "message": "success"
}
```

### 8.5 注意：前端需要配合

如果你加了 TransformInterceptor，前端的 request 配置需要调整：

```typescript
// nest-web/src/app.tsx 或 requestConfig 里
export const request = {
  // ...
  responseInterceptors: [
    (response) => {
      // 现在接口返回 { code, data, message }
      // 如果你用 ProTable，需要确保 request 函数正确解包
      return response;
    },
  ],
};
```

> ⚠️ **提示**：TransformInterceptor 是可选的。如果你的前端已经适配了当前的响应格式，可以先不加这个拦截器，等后续统一重构时再加。其他 4 个（异常处理、超时、限流、健康检查、日志）建议都加。

---

## 9. 完整改动清单

### 9.1 安装依赖

```bash
cd nest-demo
npm install @nestjs/throttler @nestjs/terminus
```

### 9.2 新建文件清单

```
apps/gateway/src/
├── filters/
│   └── rpc-exception.filter.ts      ← 第 3 章
├── interceptors/
│   ├── timeout.interceptor.ts        ← 第 4 章
│   ├── logging.interceptor.ts        ← 第 7 章
│   └── transform.interceptor.ts      ← 第 8 章（可选）
└── health/
    ├── health.controller.ts          ← 第 6 章
    └── health.module.ts              ← 第 6 章
```

### 9.3 完整的 gateway.module.ts

下面是改造后的完整文件，新增部分用注释标注：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // 🆕 限流
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
import { HealthModule } from './health/health.module';                      // 🆕 健康检查
import { RpcExceptionFilter } from './filters/rpc-exception.filter';        // 🆕 异常处理
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';    // 🆕 超时
import { LoggingInterceptor } from './interceptors/logging.interceptor';    // 🆕 日志

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d')! as any,
        },
      }),
    }),

    // ——— 🆕 限流 ———
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 3 },    // 每秒最多 3 次
        { name: 'long', ttl: 60000, limit: 60 },    // 每分钟最多 60 次
      ],
    }),

    // ——— TCP 微服务客户端 ———
    ClientsModule.register([
      {
        name: USER_SERVICE,
        transport: Transport.TCP,
        options: { host: 'localhost', port: USER_SERVICE_PORT },
      },
      {
        name: PRODUCT_SERVICE,
        transport: Transport.TCP,
        options: { host: 'localhost', port: PRODUCT_SERVICE_PORT },
      },
    ]),

    // ——— MongoDB（网关自己查 ExportTask 状态） ———
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
    ]),

    // ——— RabbitMQ 客户端（导出任务） ———
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

    // ——— 🆕 健康检查 ———
    HealthModule,
  ],
  controllers: [
    UsersController,
    ProductsController,
    AuthController,
    ExportController,
  ],
  providers: [
    AuthService,
    ExportService,
    JwtStrategy,

    // JWT 鉴权守卫（已有）
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // 🆕 限流守卫
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // 🆕 全局异常过滤器 — RPC 异常转 HTTP
    { provide: APP_FILTER, useClass: RpcExceptionFilter },

    // 🆕 全局拦截器 — 请求日志
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },

    // 🆕 全局拦截器 — 超时 5 秒
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(5000),
    },

    // 如果需要统一响应格式，取消下面的注释：
    // { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class GatewayModule {}
```

---

## 10. 常见问题

### Q1：限流和 JWT Guard 会冲突吗？

不会。NestJS 的 Guard 是按注册顺序依次执行的：
1. 先走 `ThrottlerGuard` → 检查是否超过限流
2. 再走 `JwtAuthGuard` → 检查 JWT token

如果限流触发了（429），后续 Guard 不会执行，直接返回。

### Q2：TransformInterceptor 会影响文件下载吗？

不会。ExportController 的 `download` 方法直接用 `@Res()` 注入 Response 对象并调用 `res.sendFile()`，这种方式绕过了 NestJS 的拦截器管道，TransformInterceptor 不会包装它。

### Q3：超时时间怎么调？

在 `gateway.module.ts` 里改 `new TimeoutInterceptor(5000)` 的参数，单位是毫秒。

导出接口通常比较慢？不用担心 —— `triggerExport` 只是往 RabbitMQ 发消息（毫秒级），实际导出在 export-worker 异步执行，不会触发超时。

### Q4：健康检查也需要 JWT 吗？

不需要。我们在 HealthController 上加了 `@Public()` 和 `@SkipThrottle()`，它不需要登录也不受限流限制。这样监控系统（如 Docker healthcheck、K8s liveness probe）可以直接调用。

### Q5：如果以后想用 Redis 做限流存储怎么办？

默认的 `@nestjs/throttler` 用内存存储，单机没问题。如果网关要多实例部署（负载均衡），需要换成 Redis 存储：

```bash
npm install @nestjs/throttler-storage-redis
```

```typescript
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';

ThrottlerModule.forRoot({
  throttlers: [{ name: 'short', ttl: 1000, limit: 3 }],
  storage: new ThrottlerStorageRedisService('redis://localhost:6379'),
}),
```

---

> 💡 **下一步**：所有网关能力都加好后，可以尝试用 Docker Compose 把所有服务容器化，一条命令启动整个微服务集群。
