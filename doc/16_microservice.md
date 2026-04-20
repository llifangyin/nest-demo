# 16. 微服务实战 — 把单体 NestJS 拆成多个独立服务

> **前置知识**：你已经完成了用户管理、商品管理、JWT 认证、Redis 缓存、RabbitMQ 异步导出。
> **目标**：把当前的单体应用拆成 **API 网关 + 用户服务 + 商品服务 + 导出 Worker**，体验真正的微服务架构。

---

## 目录

1. [当前架构分析 — 为什么要拆](#1-当前架构分析)
2. [目标架构 — 拆成什么样](#2-目标架构)
3. [第一步：转换为 NestJS Monorepo](#3-第一步转换为-nestjs-monorepo)
4. [第二步：创建共享库 libs/common](#4-第二步创建共享库-libscommon)
5. [第三步：创建用户服务 apps/user-service](#5-第三步创建用户服务)
6. [第四步：创建商品服务 apps/product-service](#6-第四步创建商品服务)
7. [第五步：创建 API 网关 apps/gateway](#7-第五步创建-api-网关)
8. [第六步：拆出导出 Worker apps/export-worker](#8-第六步拆出导出-worker)
9. [第七步：启动和测试](#9-第七步启动和测试)
10. [总结 — 单体 vs 微服务对比](#10-总结)

---

## 1. 当前架构分析

### 你现在的项目结构（单体）

```
nest-demo/src/
├── main.ts                 ← 一个入口，一个进程
├── app.module.ts           ← 所有模块塞在一起
├── auth/                   ← 认证
├── users/                  ← 用户 CRUD
├── products/               ← 商品 CRUD
└── export/                 ← 导出（已用 RabbitMQ，但生产者和消费者在同一进程）
```

### 问题

| 问题 | 说明 |
|------|------|
| 耦合 | 用户、商品、导出全在一个进程，改一个模块要重启整个应用 |
| 扩展难 | 商品访问量大，想单独加机器？做不到，只能整体扩容 |
| 故障传染 | 导出任务 CPU 跑满，会影响用户登录和商品查询 |

### 类比前端

```
单体 = 一个巨型 Vue 项目，所有页面、所有功能都在一个 repo 里
微服务 = 微前端，每个子应用独立开发、独立部署、独立运行
```

---

## 2. 目标架构

```
                    前端 (nest-web)
                         │
                         ▼
              ┌─────────────────────┐
              │   API Gateway        │ ← 端口 3000，统一入口
              │   (HTTP 服务)        │    路由转发、JWT 鉴权
              └──────┬──────┬───────┘
                     │      │
          TCP 通信    │      │  TCP 通信
                     ▼      ▼
         ┌───────────┐    ┌───────────────┐
         │ User       │    │ Product        │
         │ Service    │    │ Service        │
         │ (TCP 3001) │    │ (TCP 3002)     │
         └───────────┘    └───────────────┘
                │
                │ RabbitMQ 消息
                ▼
         ┌───────────────┐
         │ Export Worker  │ ← 无 HTTP 端口，纯 MQ 消费者
         └───────────────┘
```

### 通信方式选择

| 方式 | 适用场景 | 本项目用在 |
|------|---------|-----------|
| **TCP** | 服务间同步调用，低延迟 | Gateway → User/Product Service |
| **RabbitMQ** | 异步任务，不需要等结果 | User Service → Export Worker |

> **为什么不全用 HTTP？** TCP 是 NestJS 微服务内置的传输层，比 HTTP 更轻量，没有 HTTP 头的开销，适合内部服务间通信。

---

## 3. 第一步：转换为 NestJS Monorepo

NestJS CLI 支持 Monorepo 模式 —— 多个应用共享一套 `node_modules` 和配置。

### 3.1 生成 Monorepo 结构

在 `nest-demo/` 目录下执行：

```bash
# 生成第一个子应用，NestJS CLI 会自动转换为 monorepo 结构
nest generate app gateway
```

执行后项目结构变为：

```
nest-demo/
├── apps/
│   ├── nest-demo/          ← 原来的 src/ 移到了这里（默认应用）
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── ...
│   │   └── tsconfig.app.json
│   └── gateway/            ← 新生成的网关应用
│       ├── src/
│       │   ├── main.ts
│       │   └── gateway.module.ts
│       └── tsconfig.app.json
├── libs/                   ← 共享库目录（下一步创建）
├── nest-cli.json           ← 自动更新为 monorepo 配置
├── tsconfig.json
└── package.json
```

### 3.2 查看更新后的 nest-cli.json

CLI 会自动把 `nest-cli.json` 改成这样：

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/nest-demo/src",
  "monorepo": true,
  "root": "apps/nest-demo",
  "compilerOptions": {
    "webpack": false,
    "tsConfigPath": "apps/nest-demo/tsconfig.app.json"
  },
  "projects": {
    "nest-demo": {
      "type": "application",
      "root": "apps/nest-demo",
      "entryFile": "main",
      "sourceRoot": "apps/nest-demo/src",
      "compilerOptions": {
        "tsConfigPath": "apps/nest-demo/tsconfig.app.json"
      }
    },
    "gateway": {
      "type": "application",
      "root": "apps/gateway",
      "entryFile": "main",
      "sourceRoot": "apps/gateway/src",
      "compilerOptions": {
        "tsConfigPath": "apps/gateway/tsconfig.app.json"
      }
    }
  }
}
```

### 3.3 继续生成其他子应用

```bash
nest generate app user-service
nest generate app product-service
nest generate app export-worker
```

现在 `apps/` 下有 5 个应用：

```
apps/
├── nest-demo/          ← 原始应用（之后会删掉或当参考）
├── gateway/            ← API 网关
├── user-service/       ← 用户微服务
├── product-service/    ← 商品微服务
└── export-worker/      ← 导出消费者
```

---

## 4. 第二步：创建共享库 libs/common

多个服务都需要用到的东西（DTO、常量、接口），放到共享库里。

### 4.1 生成共享库

```bash
nest generate library common
```

选择 prefix 时直接回车用默认的 `@app`。

生成结构：

```
libs/
└── common/
    ├── src/
    │   ├── index.ts         ← 统一导出
    │   └── common.module.ts
    └── tsconfig.lib.json
```

### 4.2 往 libs/common 里放共享代码

把多个服务都需要的东西移过来：

```
libs/common/src/
├── index.ts                   ← 统一导出
├── dto/
│   ├── create-user.dto.ts     ← 从 users/dto/ 复制过来
│   ├── update-user.dto.ts
│   ├── create-product.dto.ts  ← 从 products/dto/ 复制过来
│   └── update-product.dto.ts
├── schemas/
│   ├── user.schema.ts         ← 从 users/schemas/ 复制过来
│   ├── product.schema.ts      ← 从 products/schemas/ 复制过来
│   └── export-task.schema.ts  ← 从 export/schemas/ 复制过来
└── constants.ts               ← 共享常量（服务名、队列名等）
```

#### libs/common/src/constants.ts

```typescript
// 微服务名称 — 网关用这些名字来连接各个服务
export const USER_SERVICE = 'USER_SERVICE';
export const PRODUCT_SERVICE = 'PRODUCT_SERVICE';
export const EXPORT_SERVICE = 'EXPORT_SERVICE';

// RabbitMQ 队列名
export const EXPORT_QUEUE = 'export_queue';

// TCP 端口
export const USER_SERVICE_PORT = 3001;
export const PRODUCT_SERVICE_PORT = 3002;
```

#### libs/common/src/index.ts

```typescript
// 统一导出，其他服务 import { User, CreateUserDto } from '@app/common'
export * from './constants';
export * from './schemas/user.schema';
export * from './schemas/product.schema';
export * from './schemas/export-task.schema';
export * from './dto/create-user.dto';
export * from './dto/update-user.dto';
export * from './dto/create-product.dto';
export * from './dto/update-product.dto';
```

### 4.3 tsconfig.json 路径映射

`nest generate library` 会自动在根 `tsconfig.json` 里加路径映射：

```json
{
  "compilerOptions": {
    "paths": {
      "@app/common": ["libs/common/src"],
      "@app/common/*": ["libs/common/src/*"]
    }
  }
}
```

这样任何服务都可以用 `import { User } from '@app/common'` 引入共享代码。

---

## 5. 第三步：创建用户服务

用户服务是一个 **TCP 微服务**，不直接对外暴露 HTTP，只接受网关的 TCP 调用。

### 5.1 apps/user-service/src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserServiceModule } from './user-service.module';
import { USER_SERVICE_PORT } from '@app/common';

async function bootstrap() {
  // 注意：这里用 createMicroservice 而不是 create
  // 因为这个服务不需要 HTTP，只提供 TCP 接口给网关调用
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: USER_SERVICE_PORT,  // 3001
      },
    },
  );
  await app.listen();
  console.log(`User Service 正在监听 TCP 端口 ${USER_SERVICE_PORT}`);
}
bootstrap();
```

**和单体 main.ts 的区别**：

| 单体 | 微服务 |
|------|--------|
| `NestFactory.create()` → HTTP 服务 | `NestFactory.createMicroservice()` → TCP 服务 |
| `app.listen(3000)` | `app.listen()` (TCP 不用指定端口，在 options 里配了) |
| 前端直接访问 | 只有网关能访问 |

### 5.2 apps/user-service/src/user-service.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@app/common';
import { UserServiceController } from './user-service.controller';
import { UserDao } from './dao/user.dao';
import { UsersService } from './users.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UserServiceController],
  providers: [UsersService, UserDao],
})
export class UserServiceModule {}
```

### 5.3 apps/user-service/src/user-service.controller.ts

**核心变化**：HTTP 装饰器 → 微服务装饰器

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from '@app/common';

@Controller()
export class UserServiceController {
  constructor(private readonly usersService: UsersService) {}

  // 原来: @Get()
  // 现在: @MessagePattern({ cmd: 'find_all_users' })
  // 网关发 { cmd: 'find_all_users' } 消息，这里就会响应
  @MessagePattern({ cmd: 'find_all_users' })
  findAll(@Payload() data: { name?: string; email?: string }) {
    return this.usersService.findAll(data.name, data.email);
  }

  @MessagePattern({ cmd: 'find_one_user' })
  findOne(@Payload() data: { id: string }) {
    return this.usersService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'find_user_by_name' })
  findByName(@Payload() data: { name: string }) {
    return this.usersService.findByName(data.name);
  }

  @MessagePattern({ cmd: 'create_user' })
  create(@Payload() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @MessagePattern({ cmd: 'update_user' })
  update(@Payload() data: { id: string; dto: UpdateUserDto }) {
    return this.usersService.update(data.id, data.dto);
  }

  @MessagePattern({ cmd: 'remove_user' })
  remove(@Payload() data: { id: string }) {
    return this.usersService.remove(data.id);
  }
}
```

**装饰器对比**：

| HTTP (单体) | TCP 微服务 | 说明 |
|-------------|-----------|------|
| `@Get()` | `@MessagePattern({ cmd: 'xxx' })` | 同步请求-响应 |
| `@Post()` | `@MessagePattern({ cmd: 'xxx' })` | 同步请求-响应 |
| `@Body()` | `@Payload()` | 获取请求数据 |
| `@Param('id')` | `@Payload() data` → `data.id` | 参数通过 payload 传递 |
| - | `@EventPattern('xxx')` | 异步事件（不需要响应） |

### 5.4 Service 和 DAO 层

Service 和 DAO 的代码**几乎不需要改**，直接从原来的 `src/users/` 复制过来：

```
apps/user-service/src/
├── main.ts
├── user-service.module.ts
├── user-service.controller.ts   ← 改用 @MessagePattern
├── users.service.ts             ← 基本不变（复制过来）
└── dao/
    └── user.dao.ts              ← 完全不变（复制过来）
```

唯一的区别是 import 路径：

```typescript
// 原来（单体）
import { User } from '../schemas/user.schema';

// 现在（微服务）
import { User } from '@app/common';
```

---

## 6. 第四步：创建商品服务

和用户服务结构完全一样，改个端口和模块名就行。

### 6.1 apps/product-service/src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ProductServiceModule } from './product-service.module';
import { PRODUCT_SERVICE_PORT } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ProductServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: PRODUCT_SERVICE_PORT,  // 3002
      },
    },
  );
  await app.listen();
  console.log(`Product Service 正在监听 TCP 端口 ${PRODUCT_SERVICE_PORT}`);
}
bootstrap();
```

### 6.2 apps/product-service/src/product-service.controller.ts

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from '@app/common';

@Controller()
export class ProductServiceController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern({ cmd: 'find_all_products' })
  findAll(@Payload() data: { name?: string }) {
    return this.productsService.findAll(data.name);
  }

  @MessagePattern({ cmd: 'find_one_product' })
  findOne(@Payload() data: { id: string }) {
    return this.productsService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'create_product' })
  create(@Payload() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @MessagePattern({ cmd: 'update_product' })
  update(@Payload() data: { id: string; dto: UpdateProductDto }) {
    return this.productsService.update(data.id, data.dto);
  }

  @MessagePattern({ cmd: 'remove_product' })
  remove(@Payload() data: { id: string }) {
    return this.productsService.remove(data.id);
  }
}
```

### 6.3 目录结构

```
apps/product-service/src/
├── main.ts
├── product-service.module.ts
├── product-service.controller.ts  ← @MessagePattern
├── products.service.ts            ← 复制过来，基本不变
└── dao/
    └── product.dao.ts             ← 复制过来，完全不变
```

---

## 7. 第五步：创建 API 网关

网关是**唯一对外暴露 HTTP 的服务**，负责：
1. 接收前端 HTTP 请求
2. 转发给对应的微服务（TCP）
3. JWT 鉴权（认证逻辑放在网关）

### 7.1 apps/gateway/src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  // 网关是普通 HTTP 服务，用 create 而不是 createMicroservice
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(3000);
  console.log('API Gateway 正在监听 HTTP 端口 3000');
}
bootstrap();
```

### 7.2 apps/gateway/src/gateway.module.ts

```typescript
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
    }),

    // 注册微服务客户端 — 告诉网关怎么连接各个服务
    ClientsModule.register([
      {
        name: USER_SERVICE,           // 注入 token
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: USER_SERVICE_PORT,    // 3001
        },
      },
      {
        name: PRODUCT_SERVICE,        // 注入 token
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: PRODUCT_SERVICE_PORT, // 3002
        },
      },
    ]),
  ],
  controllers: [AuthController, UsersController, ProductsController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class GatewayModule {}
```

### 7.3 网关的 Controller — 转发请求

**核心概念**：网关 Controller 不直接操作数据库，而是通过 `ClientProxy.send()` 把请求转发给微服务。

#### apps/gateway/src/controllers/users.controller.ts

```typescript
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Inject, Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { USER_SERVICE, CreateUserDto, UpdateUserDto } from '@app/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(
    @Inject(USER_SERVICE) private readonly userClient: ClientProxy,
  ) {}

  @Get()
  async findAll(@Query('name') name?: string, @Query('email') email?: string) {
    // send() 返回 Observable，用 firstValueFrom 转成 Promise
    return firstValueFrom(
      this.userClient.send({ cmd: 'find_all_users' }, { name, email }),
    );
  }

  @Get('me')
  getMe(@Request() req: { user: { userId: string; email: string; name: string } }) {
    return req.user;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'find_one_user' }, { id }),
    );
  }

  @Public()
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'create_user' }, dto),
    );
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'update_user' }, { id, dto }),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'remove_user' }, { id }),
    );
  }
}
```

**关键知识点**：

```typescript
// send() — 同步请求-响应模式（等结果）
this.userClient.send({ cmd: 'find_all_users' }, payload)

// emit() — 异步事件模式（不等结果）
this.userClient.emit('export_user', payload)
```

```
send() 就像 axios.get() — 发请求，等响应
emit() 就像 EventBus.$emit() — 发事件，不管结果
```

#### apps/gateway/src/controllers/products.controller.ts

```typescript
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PRODUCT_SERVICE, CreateProductDto, UpdateProductDto } from '@app/common';

@Controller('products')
export class ProductsController {
  constructor(
    @Inject(PRODUCT_SERVICE) private readonly productClient: ClientProxy,
  ) {}

  @Get()
  async findAll(@Query('name') name?: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'find_all_products' }, { name }),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'find_one_product' }, { id }),
    );
  }

  @Post()
  async create(@Body() dto: CreateProductDto) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'create_product' }, dto),
    );
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'update_product' }, { id, dto }),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return firstValueFrom(
      this.productClient.send({ cmd: 'remove_product' }, { id }),
    );
  }
}
```

#### apps/gateway/src/controllers/auth.controller.ts

```typescript
import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { USER_SERVICE } from '@app/common';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(USER_SERVICE) private readonly userClient: ClientProxy,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: { name: string; password: string }) {
    // 1. 从用户服务查询用户
    const user = await firstValueFrom(
      this.userClient.send({ cmd: 'find_user_by_name' }, { name: body.name }),
    );
    // 2. 在网关做密码验证和 JWT 签发
    return this.authService.login(user, body.password);
  }
}
```

### 7.4 网关的 Auth 模块

认证逻辑放在网关，因为网关是唯一对外的服务。

#### apps/gateway/src/auth/auth.service.ts

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(user: any, password: string) {
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('密码错误');
    }
    const payload = { sub: user._id, email: user.email, name: user.name };
    return { access_token: this.jwtService.sign(payload) };
  }
}
```

#### apps/gateway/src/auth/jwt.strategy.ts

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: { sub: string; email: string; name: string }) {
    return { userId: payload.sub, email: payload.email, name: payload.name };
  }
}
```

#### apps/gateway/src/auth/jwt-auth.guard.ts、decorators/public.decorator.ts

和原来的完全一样，直接复制过来。

### 7.5 网关目录结构总览

```
apps/gateway/src/
├── main.ts
├── gateway.module.ts
├── controllers/
│   ├── auth.controller.ts       ← 登录（调用 user-service 查用户）
│   ├── users.controller.ts      ← 用户 CRUD（转发到 user-service）
│   └── products.controller.ts   ← 商品 CRUD（转发到 product-service）
└── auth/
    ├── auth.service.ts           ← 密码校验 + JWT 签发
    ├── jwt.strategy.ts           ← JWT 解析策略
    ├── jwt-auth.guard.ts         ← 全局鉴权守卫
    └── decorators/
        └── public.decorator.ts   ← @Public() 装饰器
```

---

## 8. 第六步：拆出导出 Worker

导出 Worker 是纯 RabbitMQ 消费者，不需要 HTTP 也不需要 TCP。

### 8.1 apps/export-worker/src/main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ExportWorkerModule } from './export-worker.module';
import { EXPORT_QUEUE } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ExportWorkerModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ?? 'amqp://admin:Password01!@localhost:5672',
        ],
        queue: EXPORT_QUEUE,
        queueOptions: { durable: true },
      },
    },
  );
  await app.listen();
  console.log('Export Worker 已启动，等待消息...');
}
bootstrap();
```

### 8.2 apps/export-worker/src/export-worker.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  User, UserSchema,
  ExportTask, ExportTaskSchema,
} from '@app/common';
import { ExportProcessor } from './export.processor';
import { UserDao } from './dao/user.dao';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ExportProcessor],
  providers: [UserDao],
})
export class ExportWorkerModule {}
```

### 8.3 export.processor.ts

和原来的 `src/export/export.processor.ts` 基本一样，只是 import 路径改用 `@app/common`。

---

## 9. 第七步：启动和测试

### 9.1 添加启动脚本到 package.json

```json
{
  "scripts": {
    "start:gateway": "nest start gateway --watch",
    "start:user": "nest start user-service --watch",
    "start:product": "nest start product-service --watch",
    "start:export": "nest start export-worker --watch"
  }
}
```

### 9.2 启动顺序

**开 4 个终端**，分别执行：

```bash
# 终端1 — 先启动微服务（被调用方先启动）
npm run start:user

# 终端2
npm run start:product

# 终端3
npm run start:export

# 终端4 — 最后启动网关（调用方最后启动）
npm run start:gateway
```

### 9.3 测试

前端**不需要任何改动** —— 因为网关还是跑在 `localhost:3000`，接口路径也没变。

```bash
# 测试用户服务（通过网关）
curl http://localhost:3000/users

# 测试商品服务（通过网关）
curl http://localhost:3000/products

# 测试登录（通过网关）
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name": "test", "password": "123456"}'
```

### 9.4 请求链路可视化

```
前端: GET /proxy/products
  │
  ▼ Umi 代理
http://localhost:3000/products
  │
  ▼ 网关 ProductsController
this.productClient.send({ cmd: 'find_all_products' }, { name })
  │
  ▼ TCP 传输
Product Service (端口 3002)
  │
  ▼ @MessagePattern({ cmd: 'find_all_products' })
ProductsService.findAll()
  │
  ▼ Mongoose
MongoDB
  │
  ▼ 原路返回
前端拿到商品列表
```

---

## 10. 总结

### 单体 vs 微服务对比

| | 单体（你之前的） | 微服务（你现在的） |
|--|---|---|
| 进程数 | 1 个 | 4 个（gateway + user + product + export） |
| 通信方式 | 函数调用 | TCP / RabbitMQ |
| 部署 | 整体部署 | 各服务独立部署 |
| 扩容 | 整体扩容 | 按需扩容（商品流量大就多起几个 product-service） |
| 开发体验 | 简单直接 | 需要同时启动多个服务 |
| 适用场景 | 小项目、初期 | 大项目、团队多、流量大 |

### 改造过程中改了什么、没改什么

| 层 | 改了？ | 说明 |
|----|--------|------|
| Schema / DAO | ❌ 没改 | 数据层完全不变，移到 libs/common 统一管理 |
| Service | ❌ 基本没改 | 业务逻辑不变，只是 import 路径变了 |
| Controller | ✅ 改了 | HTTP 装饰器 → @MessagePattern（微服务端）；网关 Controller 用 ClientProxy.send() 转发 |
| Module | ✅ 改了 | 每个服务独立 Module，网关注册 ClientsModule |
| main.ts | ✅ 改了 | 每个服务自己的入口，不同的启动方式 |
| 前端 | ❌ 没改 | 网关保持原来的端口和路由，前端无感知 |

### 核心 API 速查

```typescript
// 1. 注册微服务客户端（网关 Module 里）
ClientsModule.register([{
  name: 'USER_SERVICE',
  transport: Transport.TCP,
  options: { host: 'localhost', port: 3001 },
}])

// 2. 网关 Controller 里转发请求
@Inject('USER_SERVICE') private client: ClientProxy

// send() — 同步请求响应（等返回值）
const users = await firstValueFrom(
  this.client.send({ cmd: 'find_all_users' }, payload)
);

// emit() — 异步事件（不等返回值）
this.client.emit('export_user', payload);

// 3. 微服务 Controller 里接收请求
@MessagePattern({ cmd: 'find_all_users' })   // 对应 send()
@EventPattern('export_user')                  // 对应 emit()
```

---

> 💡 **下一步**：你可以继续学习 [API 网关的进阶功能](./17_gateway.md)，包括限流、熔断、日志聚合等。
