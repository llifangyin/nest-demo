# 16. 微服务实战 — 把单体 NestJS 拆成多个独立服务

> **前置知识**：你已经完成了用户管理、商品管理、JWT 认证、Redis 缓存、RabbitMQ 异步导出。
> **目标**：把当前的单体应用拆成 **API 网关 + 用户服务 + 商品服务 + 导出 Worker**，体验真正的微服务架构。

---

## 目录

**第一部分：总览（先看这里）**

1. [为什么要拆 — 单体的问题](#1-为什么要拆--单体的问题)
2. [拆成什么样 — 目标架构](#2-拆成什么样--目标架构)
3. [改了什么、没改什么 — 改造清单](#3-改了什么没改什么--改造清单)
4. [核心 API 速查 — 关键方法一览](#4-核心-api-速查--关键方法一览)
5. [各服务职责与通信流程](#5-各服务职责与通信流程)

**第二部分：动手改造（按步骤来）**

6. [第一步：转换为 Monorepo + 创建共享库](#6-第一步转换为-monorepo--创建共享库)
7. [第二步：创建用户服务 user-service](#7-第二步创建用户服务-user-service)
8. [第三步：创建商品服务 product-service](#8-第三步创建商品服务-product-service)
9. [第四步：创建 API 网关 gateway](#9-第四步创建-api-网关-gateway)
10. [第五步：拆出导出 Worker export-worker](#10-第五步拆出导出-worker-export-worker)
11. [第六步：处理原始 apps/nest-demo](#11-第六步处理原始-appsnest-demo)
12. [第七步：.env 配置](#12-第七步env-配置)
13. [第八步：启动和测试](#13-第八步启动和测试)

---

# 第一部分：总览

---

## 1. 为什么要拆 — 单体的问题

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

## 2. 拆成什么样 — 目标架构

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

### 最终目录结构

```
nest-demo/
├── .env                       ← 所有服务共享的环境变量
├── package.json
├── nest-cli.json              ← monorepo 配置
├── apps/
│   ├── nest-demo/             ← 原始单体应用（保留参考，不再启动）
│   ├── gateway/               ← API 网关（HTTP 3000）
│   ├── user-service/          ← 用户微服务（TCP 3001）
│   ├── product-service/       ← 商品微服务（TCP 3002）
│   └── export-worker/         ← 导出消费者（RabbitMQ）
└── libs/
    └── common/                ← 共享库（DTO、Schema、常量）
```

### 通信方式选择

| 方式 | 适用场景 | 本项目用在 |
|------|---------|-----------|
| **TCP** | 服务间同步调用，低延迟 | Gateway → User/Product Service |
| **RabbitMQ** | 异步任务，不需要等结果 | Gateway → Export Worker |

> **为什么不全用 HTTP？** TCP 是 NestJS 微服务内置的传输层，比 HTTP 更轻量，没有 HTTP 头的开销，适合内部服务间通信。

---

## 3. 改了什么、没改什么 — 改造清单

### 一句话总结

> **数据层（Schema/DAO）和业务层（Service）基本不动，只改入口（main.ts）、控制层（Controller）和模块注册（Module）。前端零改动。**

### 逐层对比

| 层 | 改了？ | 怎么改 |
|----|--------|--------|
| **Schema / DAO** | ❌ 没改 | 原封不动复制到各服务（或 libs/common），只改 import 路径 |
| **Service** | ❌ 基本没改 | 业务逻辑不变，去掉缓存（缓存交给网关），改 import 路径 |
| **Controller** | ✅ 改了 | 微服务端：`@Get()` → `@MessagePattern()`，`@Body()` → `@Payload()`<br>网关端：新写 Controller，用 `ClientProxy.send()` 转发 |
| **Module** | ✅ 改了 | 每个服务独立 Module，网关注册 `ClientsModule` 连接各服务 |
| **main.ts** | ✅ 改了 | 微服务：`NestFactory.create()` → `NestFactory.createMicroservice()`<br>网关：保持 `NestFactory.create()`（仍是 HTTP） |
| **前端** | ❌ 没改 | 网关保持 `localhost:3000` 和原来的路由，前端完全无感知 |

### 单体 vs 微服务对比

| | 单体（改造前） | 微服务（改造后） |
|--|---|---|
| 进程数 | 1 个 | 4 个（gateway + user + product + export） |
| 通信方式 | 函数调用 | TCP / RabbitMQ |
| 部署 | 整体部署 | 各服务独立部署 |
| 扩容 | 整体扩容 | 按需扩容（商品流量大就多起几个 product-service） |
| 开发体验 | 简单直接 | 需要同时启动多个服务 |
| 适用场景 | 小项目、初期 | 大项目、团队多、流量大 |

---

## 4. 核心 API 速查 — 关键方法一览

### 4.1 装饰器对比（单体 → 微服务）

| HTTP (单体 Controller) | TCP 微服务 Controller | 说明 |
|---|---|---|
| `@Get()` / `@Post()` / `@Put()` / `@Delete()` | `@MessagePattern({ cmd: 'xxx' })` | 同步请求-响应 |
| `@Body()` | `@Payload()` | 获取请求数据 |
| `@Param('id')` | `@Payload() data` → `data.id` | 参数通过 payload 传递 |
| — | `@EventPattern('xxx')` | 异步事件（不需要响应） |

### 4.2 网关转发请求

```typescript
// 注入微服务客户端
@Inject('USER_SERVICE') private client: ClientProxy

// send() — 同步请求响应（等返回值），类似 axios.get()
const users = await firstValueFrom(
  this.client.send({ cmd: 'find_all_users' }, payload)
);

// emit() — 异步事件（不等返回值），类似 EventBus.$emit()
this.client.emit('export_user', payload);
```

### 4.3 微服务接收请求

```typescript
// 对应 send()  — 同步，必须 return 结果
@MessagePattern({ cmd: 'find_all_users' })
findAll(@Payload() data) { return this.service.findAll(); }

// 对应 emit() — 异步，不需要 return
@EventPattern('export_user')
handleExport(@Payload() data) { /* 处理导出 */ }
```

### 4.4 网关注册微服务客户端

```typescript
// TCP 客户端（同步调用）
ClientsModule.register([{
  name: 'USER_SERVICE',
  transport: Transport.TCP,
  options: { host: 'localhost', port: 3001 },
}])

// RabbitMQ 客户端（异步事件）
ClientsModule.registerAsync([{
  name: 'EXPORT_SERVICE',
  useFactory: (config) => ({
    transport: Transport.RMQ,
    options: { urls: [config.get('RABBITMQ_URL')], queue: 'export_queue' },
  }),
}])
```

### 4.5 微服务入口启动

```typescript
// TCP 微服务
NestFactory.createMicroservice(Module, {
  transport: Transport.TCP,
  options: { host: '0.0.0.0', port: 3001 },
});

// RabbitMQ 微服务
NestFactory.createMicroservice(Module, {
  transport: Transport.RMQ,
  options: { urls: ['amqp://...'], queue: 'export_queue' },
});
```

---

## 5. 各服务职责与通信流程

### 5.1 四个服务各自干什么

| 服务 | 类型 | 端口 | 职责 |
|------|------|------|------|
| **gateway** | HTTP 服务 | 3000 | 唯一对外入口，JWT 鉴权，转发请求，导出任务触发/状态查询 |
| **user-service** | TCP 微服务 | 3001 | 用户 CRUD + findByName（含密码，给登录用） |
| **product-service** | TCP 微服务 | 3002 | 商品 CRUD |
| **export-worker** | RabbitMQ 消费者 | 无 | 消费导出消息，查库生成 CSV |

### 5.2 请求链路

#### 普通 CRUD 请求（以查商品为例）

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

#### 登录请求

```
前端: POST /proxy/auth/login { name, password }
  │
  ▼ Umi 代理
网关 AuthController.login()
  │
  ├─ 1. this.userClient.send({ cmd: 'find_user_by_name' }, { name })
  │      → user-service 查用户（带 password）
  │      ← 返回用户对象
  │
  └─ 2. this.authService.login(user, password)
         → bcrypt.compare 校验密码
         → jwtService.sign() 签发 JWT
         ← 返回 { access_token }
```

#### 导出请求（异步）

```
前端: POST /proxy/export/users
  │
  ▼ Umi 代理
网关 ExportController.triggerExport()
  │
  ├─ 1. 创建 ExportTask（status: pending）写入 MongoDB
  └─ 2. this.client.emit('export_user', { taskId, filter })
         → RabbitMQ 发消息（不等返回）
         ← 立即返回 { taskId, message: '导出任务已创建' }

                    ↓ 异步

Export Worker 收到消息
  │
  ├─ 更新 ExportTask → processing
  ├─ UserDao.findAll() → 查 MongoDB
  ├─ 生成 CSV 文件
  └─ 更新 ExportTask → done + filePath
```

### 5.3 共享库 libs/common 放什么

```
libs/common/src/
├── index.ts                   ← 统一导出
├── constants.ts               ← 服务名(USER_SERVICE)、端口(3001)、队列名
├── dto/                       ← 所有 DTO（CreateUserDto、UpdateProductDto...）
└── schemas/                   ← 所有 Mongoose Schema（User、Product、ExportTask）
```

任何服务都可以 `import { User, CreateUserDto, USER_SERVICE } from '@app/common'`。

### 5.4 注意事项

| 要点 | 说明 |
|------|------|
| **findByName 要返回密码** | 网关登录需要 bcrypt 比对，user-service 的 DAO 里 `findByName` 要加 `.select('+password')`，Schema 里 password 加 `select: false` 默认隐藏 |
| **微服务 Service 不需要缓存** | 缓存职责交给网关层，微服务直接查库，保持简单 |
| **export-worker 直接查库** | 不走 TCP 调 user-service，直接用 UserDao 查 MongoDB（共享同一个数据库） |
| **.env 放在项目根目录** | Monorepo 所有 app 的工作目录都是根目录，一个 `.env` 所有服务共享 |
| **前端零改动** | 网关保持 `localhost:3000`，路由路径不变 |

---

# 第二部分：动手改造

---

## 6. 第一步：转换为 Monorepo + 创建共享库

### 6.1 生成 Monorepo 结构

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

### 6.2 查看更新后的 nest-cli.json

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

### 6.3 继续生成其他子应用

```bash
nest generate app user-service
nest generate app product-service
nest generate app export-worker
```

### 6.4 生成共享库

```bash
nest generate library common
# prefix 直接回车用默认的 @app
```

生成结构：

```
libs/
└── common/
    ├── src/
    │   ├── index.ts         ← 统一导出
    │   └── common.module.ts
    └── tsconfig.lib.json
```

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

### 6.5 往 libs/common 里放共享代码

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

#### User Schema — password 加默认隐藏

```typescript
// libs/common/src/schemas/user.schema.ts
@Prop({ required: true, select: false })  // select: false → 查询默认不返回
password: string;
```

这样普通查询（findAll、findById）不会泄露密码，只有显式 `.select('+password')` 才返回。

---

## 7. 第二步：创建用户服务 user-service

用户服务是一个 **TCP 微服务**，不直接对外暴露 HTTP，只接受网关的 TCP 调用。

### 7.1 apps/user-service/src/main.ts

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

### 7.2 apps/user-service/src/user-service.module.ts

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

### 7.3 apps/user-service/src/user-service.controller.ts

**核心变化**：HTTP 装饰器 → 微服务装饰器

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from '@app/common';

@Controller()
export class UserServiceController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'find_all_users' })
  findAll(@Payload() data: { name?: string; email?: string }) {
    return this.usersService.findAll(data.name, data.email);
  }

  @MessagePattern({ cmd: 'find_one_user' })
  findOne(@Payload() data: { id: string }) {
    return this.usersService.findOne(data.id);
  }

  // 注意：这个方法给网关登录用，必须返回 password 字段
  // 所以 Service/DAO 里要用 .select('+password') 查询
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

### 7.4 Service 和 DAO 层

Service 和 DAO 的代码**几乎不需要改**，直接从原来的 `src/users/` 复制过来。

唯一改动：

1. **import 路径**：`import { User } from '../schemas/user.schema'` → `import { User } from '@app/common'`
2. **去掉缓存**：Service 里删除 `CACHE_MANAGER` 相关代码，直接查库
3. **findByName 加密码查询**：

```typescript
// apps/user-service/src/dao/user.dao.ts 中
findByName(name: string): Promise<User | null> {
  // 加 .select('+password')，否则默认不返回 password
  return this.userModel.findOne({ name }).select('+password').exec();
}
```

### 7.5 目录结构

```
apps/user-service/src/
├── main.ts
├── user-service.module.ts
├── user-service.controller.ts   ← 改用 @MessagePattern
├── users.service.ts             ← 基本不变（去掉缓存）
└── dao/
    └── user.dao.ts              ← 基本不变（findByName 加 select password）
```

---

## 8. 第三步：创建商品服务 product-service

和用户服务结构完全一样，改个端口和模块名就行。

### 8.1 apps/product-service/src/main.ts

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

### 8.2 apps/product-service/src/product-service.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '@app/common';
import { ProductServiceController } from './product-service.controller';
import { ProductDao } from './dao/product.dao';
import { ProductsService } from './products.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  controllers: [ProductServiceController],
  providers: [ProductsService, ProductDao],
})
export class ProductServiceModule {}
```

### 8.3 apps/product-service/src/product-service.controller.ts

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

### 8.4 目录结构

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

## 9. 第四步：创建 API 网关 gateway

网关是**唯一对外暴露 HTTP 的服务**，负责：
1. 接收前端 HTTP 请求
2. 转发给对应的微服务（TCP / RabbitMQ）
3. JWT 鉴权（认证逻辑放在网关）

### 9.1 apps/gateway/src/main.ts

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

### 9.2 apps/gateway/src/gateway.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
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
import { ExportService } from './services/export.service';
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
          expiresIn: config.get('JWT_EXPIRES_IN', '7d') as any,
        },
      }),
    }),

    // MongoDB — 网关直接查 ExportTask 状态
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: ExportTask.name, schema: ExportTaskSchema },
    ]),

    // TCP 客户端 — 连接 user-service 和 product-service
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

    // RabbitMQ 客户端 — 连接 export-worker
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
  ],
  controllers: [AuthController, UsersController, ProductsController, ExportController],
  providers: [
    AuthService,
    ExportService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class GatewayModule {}
```

### 9.3 网关 Controllers — 转发请求

网关 Controller **不直接操作数据库**，而是通过 `ClientProxy.send()` 转发给微服务。

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
    // 1. 从用户服务查询用户（带密码）
    const user = await firstValueFrom(
      this.userClient.send({ cmd: 'find_user_by_name' }, { name: body.name }),
    );
    // 2. 在网关做密码验证和 JWT 签发
    return this.authService.login(user, body.password);
  }
}
```

#### apps/gateway/src/controllers/export.controller.ts

```typescript
import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { ExportService } from '../services/export.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('users')
  triggerExport(@Body() filter: { name?: string; email?: string }) {
    return this.exportService.triggerExport(filter);
  }

  @Get('status/:taskId')
  getTaskStatus(@Param('taskId') taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }

  @Public()
  @Get('download/:taskId')
  async download(@Param('taskId') taskId: string, @Res() res: Response) {
    const task = await this.exportService.getTaskStatus(taskId);
    if (!task || task.status !== 'done' || !task.filePath) {
      return res.status(404).json({ message: 'File not found or not ready' });
    }
    const fileName = path.basename(task.filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(task.filePath);
  }
}
```

### 9.4 网关的 Auth 模块

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

### 9.5 网关的 Export Service

```typescript
// apps/gateway/src/services/export.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ExportTask, EXPORT_SERVICE } from '@app/common';

@Injectable()
export class ExportService {
  constructor(
    @Inject(EXPORT_SERVICE) private readonly client: ClientProxy,
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
  ) {}

  async triggerExport(filter: { name?: string; email?: string }) {
    const taskId = randomUUID();
    await this.taskModel.create({ taskId, status: 'pending' });
    this.client.emit('export_user', { taskId, filter });
    return { taskId, message: '导出任务已创建' };
  }

  async getTaskStatus(taskId: string) {
    const task = await this.taskModel.findOne({ taskId });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }
}
```

### 9.6 网关目录结构总览

```
apps/gateway/src/
├── main.ts
├── gateway.module.ts
├── controllers/
│   ├── auth.controller.ts       ← 登录（调用 user-service 查用户）
│   ├── users.controller.ts      ← 用户 CRUD（转发到 user-service）
│   ├── products.controller.ts   ← 商品 CRUD（转发到 product-service）
│   └── export.controller.ts     ← 导出（RabbitMQ 发消息给 export-worker）
├── services/
│   └── export.service.ts        ← 导出业务逻辑（发消息 + 查状态）
└── auth/
    ├── auth.service.ts           ← 密码校验 + JWT 签发
    ├── jwt.strategy.ts           ← JWT 解析策略
    ├── jwt-auth.guard.ts         ← 全局鉴权守卫
    └── decorators/
        └── public.decorator.ts   ← @Public() 装饰器
```

---

## 10. 第五步：拆出导出 Worker export-worker

导出 Worker 是纯 RabbitMQ 消费者，不需要 HTTP 也不需要 TCP。

### 10.1 apps/export-worker/src/main.ts

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

### 10.2 apps/export-worker/src/export-worker.module.ts

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

### 10.3 apps/export-worker/src/export.processor.ts

```typescript
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { ExportTask } from '@app/common';
import { UserDao } from './dao/user.dao';

@Controller()
export class ExportProcessor {
  constructor(
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
    private readonly userDao: UserDao,
  ) {}

  @EventPattern('export_user')
  async handleExportUsers(
    @Payload() data: { taskId: string; filter: { name?: string; email?: string } },
  ) {
    const { taskId, filter } = data;
    await this.taskModel.updateOne({ taskId }, { status: 'processing' });

    try {
      const users = await this.userDao.findAll(filter);
      const csvRows = [
        'name,email,createdAt',
        ...users.map((u: any) => `${u.name},${u.email},${u.createdAt}`),
      ];
      const csvContent = csvRows.join('\n');

      const fileName = `export_${taskId}.csv`;
      const filePath = path.join(__dirname, '..', 'exports', fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, csvContent, 'utf-8');

      await this.taskModel.updateOne({ taskId }, { status: 'done', filePath });
    } catch (error) {
      await this.taskModel.updateOne(
        { taskId },
        { status: 'failed', errorMsg: String(error) },
      );
    }
  }
}
```

### 10.4 export-worker 的目录结构

```
apps/export-worker/src/
├── main.ts
├── export-worker.module.ts
├── export.processor.ts
└── dao/
    └── user.dao.ts              ← 从 user-service 复制过来
```

> **为什么不通过 TCP 调 user-service？** 可以，但导出是后台任务，直接查数据库更简单。export-worker 和 user-service 共享同一个 MongoDB，直接用 UserDao 查询即可。

---

## 11. 第六步：处理原始 apps/nest-demo

转 monorepo 后，原来的代码自动移到了 `apps/nest-demo/`。现在各微服务都写好了，这个原始应用需要处理。

### 两种选择

| 方案 | 操作 | 适合场景 |
|------|------|----------|
| **保留当参考** | 不改不删，只是不再启动它 | 开发期间随时对照原始代码 |
| **删掉** | 删除 `apps/nest-demo/` 目录，从 `nest-cli.json` 的 `projects` 中移除 | 代码干净，避免混淆 |

### 如果选择删除

```bash
# 1. 删除目录
rm -rf apps/nest-demo

# 2. 修改 nest-cli.json
#    把 "root" 改为 "apps/gateway"（或任一存在的 app）
#    把 "sourceRoot" 改为 "apps/gateway/src"
#    从 "projects" 中删掉 "nest-demo" 条目
```

修改后的 `nest-cli.json`（关键部分）：

```json
{
  "monorepo": true,
  "root": "apps/gateway",
  "sourceRoot": "apps/gateway/src",
  "compilerOptions": {
    "webpack": false,
    "tsConfigPath": "apps/gateway/tsconfig.app.json"
  },
  "projects": {
    "gateway": { ... },
    "user-service": { ... },
    "product-service": { ... },
    "export-worker": { ... },
    "common": { ... }
  }
}
```

### 建议

学习阶段先**保留**，等微服务全部跑通后再删。

---

## 12. 第七步：.env 配置

### .env 文件放在哪？

Monorepo 模式下，所有 app 的工作目录都是**项目根目录**（`nest-demo/`），所以 `.env` 放在根目录即可，所有服务都能读到：

```
nest-demo/
├── .env                    ← 放这里，所有 app 共享
├── apps/
│   ├── gateway/
│   ├── user-service/
│   ├── product-service/
│   └── export-worker/
└── ...
```

### .env 内容

```env
# MongoDB
MONGODB_URI=mongodb://zanyu:zanyu%40123@localhost:27017/nest-demo?authSource=admin

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Redis（网关如果需要缓存可以加，微服务可以不用）
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://admin:Password01!@localhost:5672

# 端口（可选，默认值已在代码中）
PORT=3000
```

---

## 13. 第八步：启动和测试

### 13.1 添加启动脚本到 package.json

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

### 13.2 启动顺序

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

### 13.3 测试

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

---

> 💡 **下一步**：你可以继续学习 [API 网关的进阶功能](./17_gateway.md)，包括限流、熔断、日志聚合等。
