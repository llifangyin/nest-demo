# 后端技术学习指南 — 从前端视角理解本项目

> **目标读者**：熟悉前端（Vue/React），了解 Node.js 但不精通，后端知识一知半解的开发者。
> **学习方式**：每个章节先讲概念（类比前端），再看本项目中的真实代码，最后给一个可运行的 mini demo。

---

## 目录

1. [Node.js 与 NestJS — 后端的 Vue](#1-nodejs-与-nestjs--后端的-vue)
2. [MongoDB + Mongoose — 后端的 "状态管理"](#2-mongodb--mongoose--后端的状态管理)
3. [RESTful API 与 Controller — 后端的 "路由"](#3-restful-api-与-controller--后端的路由)
4. [依赖注入(DI) — 后端的 "provide/inject"](#4-依赖注入di--后端的-provideinject)
5. [Guard / Interceptor / Filter — 后端的 "路由守卫与中间件"](#5-guard--interceptor--filter--后端的路由守卫与中间件)
6. [JWT 认证 — 后端的 "登录态管理"](#6-jwt-认证--后端的登录态管理)
7. [Redis 缓存 — 后端的 "本地缓存/SessionStorage"](#7-redis-缓存--后端的本地缓存sessionstorage)
8. [RabbitMQ 消息队列 — 后端的 "事件总线"](#8-rabbitmq-消息队列--后端的事件总线)
9. [API 网关 — 后端的 "Nginx/反向代理"](#9-api-网关--后端的nginx反向代理)
10. [MinIO 对象存储 — 后端的 "CDN/文件服务"](#10-minio-对象存储--后端的cdn文件服务)
11. [微服务架构 — 把一个大 App 拆成多个小 App](#11-微服务架构--把一个大-app-拆成多个小-app)
12. [定时任务(Cron) — 后端的 "setInterval"](#12-定时任务cron--后端的-setinterval)
13. [Docker 与部署 — 后端的 "npm run build + 上线"](#13-docker-与部署--后端的-npm-run-build--上线)
14. [本地环境搭建 & 30分钟跑起来](#14-本地环境搭建--30分钟跑起来)

---

## 1. Node.js 与 NestJS — 后端的 Vue

### 类比

| 前端概念 | 后端对应 |
|---------|---------|
| Vue/React | NestJS（框架） |
| 组件 (.vue) | Module + Controller + Service |
| main.ts (createApp) | main.ts (NestFactory.create) |
| Vue Router | Controller 的 `@Get()` / `@Post()` |
| Vuex/Pinia | Service 层 |
| npm/yarn | npm/yarn（一样的） |

### 本项目入口

```
apps/main/src/main.ts  → 核心业务服务，端口 3004
apps/gateway/src/main.ts  → API网关，端口 3000
```

每个 NestJS 应用的启动方式和前端非常像：

```typescript
// 前端: main.ts
const app = createApp(App)
app.use(router)
app.mount('#app')

// 后端: apps/main/src/main.ts — 概念完全对应
const app = await NestFactory.create(AppModule)  // 创建应用
app.useGlobalPipes(new ValidationPipe())          // 注册全局管道（类似全局中间件）
await app.listen(3004)                            // 监听端口（前端不需要这步）
```

### Mini Demo: 创建你的第一个 NestJS 应用

```bash
# 1. 全局安装 NestJS CLI
npm i -g @nestjs/cli

# 2. 创建新项目
nest new my-first-nestjs

# 3. 进入项目并启动
cd my-first-nestjs
npm run start:dev

# 4. 打开浏览器访问 http://localhost:3000 ，看到 "Hello World!"
```

生成的项目结构：

```
src/
├── app.module.ts      ← 根模块（类似 App.vue）
├── app.controller.ts  ← 控制器（类似路由页面）
├── app.service.ts     ← 服务（类似 store/api 层）
└── main.ts            ← 入口（类似 main.ts）
```

---

## 2. MongoDB + Mongoose — 后端的 "状态管理"

### 类比

| 前端概念 | 后端对应 |
|---------|---------|
| localStorage | 数据库（MongoDB） |
| TypeScript interface | Mongoose Schema（数据结构定义） |
| Pinia store | Mongoose Model（增删改查操作） |
| JSON 对象 | MongoDB Document（一条记录） |

### 为什么是 MongoDB 而不是 MySQL？

MongoDB 存的就是 JSON（准确说是 BSON），对前端开发者来说非常亲切：

```javascript
// MySQL 存数据 → 一行一行的表格, 要写 SQL
// MongoDB 存数据 → 就是 JSON 对象！
{
  "_id": "507f1f77bcf86cd799439011",  // 自动生成的唯一ID
  "name": "标注任务A",
  "status": "processing",
  "setting": {
    "skipLimit": 10,
    "labelConfig": [{ "type": "bbox", "name": "人脸" }]
  },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 本项目中的 Schema 定义

本项目的 Schema 都在 `libs/base/src/schema/` 下面，类似前端的 TypeScript 类型定义：

```typescript
// libs/base/src/schema/batch.schema.ts — 批次数据 Schema
@Schema({ versionKey: false, timestamps: true })
export class Batch extends Base {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  spaceId: Types.ObjectId            // 所属空间ID

  @Prop({ type: String, required: true })
  name: string                       // 批次名称

  @Prop({ type: String, enum: BATCH_STATUS, default: BATCH_STATUS.PENDING })
  status: BATCH_STATUS               // 状态（枚举值）

  @Prop({ type: BatchCountSchema, required: true, default: { items: 0 } })
  count: IBatchCount                  // 嵌套对象
}

export const BatchSchema = SchemaFactory.createForClass(Batch)
```

### 本项目中的 DAO 模式（数据访问层）

本项目把数据库操作封装在 DAO 里（类似前端的 api 层）：

```typescript
// apps/main/src/modules/user/dao/user.dao.ts
@Injectable()
export class UserDao {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>
  ) {}

  // 等同于前端的: api.getUser({ username })
  async findUsername(username: string): Promise<User> {
    return this.userModel.findOne({
      $and: [
        { $or: [{ username }, { phone: username }, { email: username }] },
        { sys_status: DATA_STATUS.USING }
      ]
    }).select('+password')
  }

  // 等同于前端的: api.createUser(data)
  async create(data: IUser): Promise<User> {
    return this.userModel.create(data)
  }
}
```

### Mini Demo: 连接 MongoDB 并做 CRUD

```bash
# 0. 先用 Docker 启动一个 MongoDB（后面 Docker 章节会讲）
docker run -d -p 27017:27017 --name my-mongo mongo:7

# 1. 在你的 NestJS 项目中安装依赖
npm i @nestjs/mongoose mongoose
```

```typescript
// src/cat.schema.ts — 定义一个 "猫" 的 Schema
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true })  // 自动加 createdAt/updatedAt
export class Cat extends Document {
  @Prop({ required: true })
  name: string

  @Prop()
  age: number

  @Prop()
  breed: string
}

export const CatSchema = SchemaFactory.createForClass(Cat)
```

```typescript
// src/cat.service.ts — 对猫做增删改查
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Cat } from './cat.schema'

@Injectable()
export class CatService {
  constructor(@InjectModel(Cat.name) private catModel: Model<Cat>) {}

  // 创建
  async create(name: string, age: number, breed: string) {
    return this.catModel.create({ name, age, breed })
  }

  // 查询全部
  async findAll() {
    return this.catModel.find()
  }

  // 按ID查询
  async findById(id: string) {
    return this.catModel.findById(id)
  }

  // 更新
  async update(id: string, data: Partial<Cat>) {
    return this.catModel.findByIdAndUpdate(id, data, { new: true })
  }

  // 删除
  async delete(id: string) {
    return this.catModel.findByIdAndDelete(id)
  }
}
```

```typescript
// src/cat.controller.ts — 暴露 HTTP 接口
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common'
import { CatService } from './cat.service'

@Controller('cats')  // 所有路由都以 /cats 开头
export class CatController {
  constructor(private readonly catService: CatService) {}

  @Post()              // POST /cats
  create(@Body() body: { name: string; age: number; breed: string }) {
    return this.catService.create(body.name, body.age, body.breed)
  }

  @Get()               // GET /cats
  findAll() {
    return this.catService.findAll()
  }

  @Get(':id')          // GET /cats/xxxxx
  findOne(@Param('id') id: string) {
    return this.catService.findById(id)
  }

  @Put(':id')          // PUT /cats/xxxxx
  update(@Param('id') id: string, @Body() body: Partial<Cat>) {
    return this.catService.update(id, body)
  }

  @Delete(':id')       // DELETE /cats/xxxxx
  delete(@Param('id') id: string) {
    return this.catService.delete(id)
  }
}
```

```typescript
// src/app.module.ts — 注册模块
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Cat, CatSchema } from './cat.schema'
import { CatController } from './cat.controller'
import { CatService } from './cat.service'

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/my-demo'),  // 连接数据库
    MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }]),  // 注册 Schema
  ],
  controllers: [CatController],
  providers: [CatService],
})
export class AppModule {}
```

用 Postman 或浏览器测试：
- `POST http://localhost:3000/cats` → body: `{ "name": "Tom", "age": 3, "breed": "British" }`
- `GET http://localhost:3000/cats` → 返回所有猫

---

## 3. RESTful API 与 Controller — 后端的 "路由"

### 类比

| 前端 Vue Router | NestJS Controller |
|----------------|-------------------|
| `path: '/user'` | `@Controller('user')` |
| `router.get('/list')` | `@Get('list')` |
| `router.post('/create')` | `@Post('create')` |
| `route.params.id` | `@Param('id')` |
| `route.query.keyword` | `@Query('keyword')` |
| `request.body` | `@Body()` |

### 本项目中的 Controller

```typescript
// apps/main/src/modules/export/controller/export.controller.ts
@Controller('export')  // 基础路由: /export
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('batch')  // POST /export/batch
  async export(@Body() dto: BatchExportDto) {
    const { taskId, batchIds, limit, line } = dto
    return this.exportService.export(taskId, batchIds, limit, line)
  }

  @Post('export-task')  // POST /export/export-task
  @UseGuards(PointsGuard())   // 路由守卫（需要积分校验）
  async createExportTask(@Body() dto: CreateExportTask, @AuthUser() user) {
    return this.exportService.create(dto.taskId, dto.exportMetadata, user)
  }
}
```

### DTO 验证 — 后端的 "表单校验"

前端有 element-ui 的表单规则，后端用 `class-validator` 做同样的事：

```typescript
// DTO (Data Transfer Object) — 就像前端的表单 interface + 校验规则
import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator'

export class CreateTaskDto {
  @IsNotEmpty({ message: '任务名称不能为空' })
  @IsString()
  name: string

  @IsNotEmpty()
  spaceId: string

  @IsOptional()
  @IsArray()
  tags?: string[]
}
```

---

## 4. 依赖注入(DI) — 后端的 "provide/inject"

### 类比

Vue 3 的 `provide/inject` 和 NestJS 的依赖注入几乎是同一个概念：

```typescript
// 前端 Vue 3
// 父组件 provide
provide('userService', new UserService())

// 子组件 inject
const userService = inject('userService')
```

```typescript
// 后端 NestJS — 框架自动做 provide/inject
@Injectable()                              // 声明 "我可以被注入"
export class UserService {
  constructor(private readonly dao: UserDao) {}  // 自动注入 UserDao
}

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}  // 自动注入 UserService
}
```

NestJS 的 Module 就相当于声明 "这个作用域里有哪些 provider"：

```typescript
@Module({
  providers: [UserService, UserDao],          // 可注入的服务列表
  controllers: [UserController],              // 路由控制器
  exports: [UserService],                     // 暴露给其他模块（类似 export）
})
export class UserModule {}
```

### 生命周期

```
前端组件: setup() → mounted → updated → unmounted
NestJS:   constructor → onModuleInit → onApplicationBootstrap → onModuleDestroy
```

---

## 5. Guard / Interceptor / Filter — 后端的 "路由守卫与中间件"

### 类比

| 前端概念 | NestJS 对应 | 作用 |
|---------|------------|------|
| `router.beforeEach()` | Guard | 请求前拦截（鉴权、权限检查） |
| Axios 请求/响应拦截器 | Interceptor | 请求前后统一处理（格式化响应） |
| Axios 全局 catch | Exception Filter | 统一错误处理 |
| `router.beforeEach()` 中的 next() | `canActivate()` 返回 true/false | 放行或拒绝 |

### 执行顺序

```
请求进来
  → Middleware（中间件，最先执行）
    → Guard（守卫，鉴权拦截）
      → Interceptor（拦截器-请求前）
        → Controller 方法执行
      → Interceptor（拦截器-响应后）
    → Exception Filter（如果有异常）
  → 返回响应
```

### 本项目中的 Guard

```typescript
// apps/main/src/core/access_control/authentication.guard.ts
@Injectable()
export class AuthenticationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const path = request.originalUrl

    // 白名单路径直接放行（类似前端路由守卫的 whiteList）
    if (pathInList(path, config.auth_whitelist_module)) return true

    // 检查 token
    const token = request.headers['access-token']
    if (token) {
      // 从缓存/数据库获取用户信息
      const user = await this.cacheService.start(key, 60, async () => {
        return await this.authService.findUserByToken(token)
      })
      request.auth_user = user
      return true  // 放行
    }

    throw new UnauthorizedException()  // 未登录，返回 401
  }
}
```

### 本项目中的 Interceptor

```typescript
// apps/main/src/core/response.interceptor.ts
// 作用：统一响应格式 + 慢请求日志
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context, next) {
    const now = Date.now()
    return next.handle().pipe(
      map((data) => {
        const responseTime = Date.now() - now
        // 慢请求记录（超过3秒）
        if (responseTime > 3000) { /* 写入数据库 */ }
        // 统一包装响应格式: { code: 200, data: {...} }
        return { code: 200, data }
      })
    )
  }
}
```

### Mini Demo: 写一个简单的鉴权 Guard

```typescript
// src/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

@Injectable()
export class SimpleAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const token = request.headers['authorization']

    if (!token || token !== 'my-secret-token') {
      throw new UnauthorizedException('请先登录')
    }

    return true
  }
}

// 使用方式 1: 单个路由
@Get('profile')
@UseGuards(SimpleAuthGuard)
getProfile() {
  return { name: '张三' }
}

// 使用方式 2: 全局（本项目的用法）
// app.module.ts
@Module({
  providers: [{ provide: APP_GUARD, useClass: SimpleAuthGuard }]
})
```

---

## 6. JWT 认证 — 后端的 "登录态管理"

### 类比

| 前端 | 后端 |
|------|------|
| `localStorage.setItem('token', token)` | Redis 存 session / 数据库存 AccessToken |
| Axios 请求头带 token | Guard 从 header 取 token 验证 |
| token 过期 → 跳登录页 | token 过期 → 返回 401 |

### JWT 是什么？

JWT (JSON Web Token) 就是一个加密的 JSON 字符串，服务端生成、客户端保存：

```
前端存的 token: eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjM0NTYifQ.xxxxx

解码后:
{
  "alg": "HS256"      // 头: 加密算法
}
.
{
  "userId": "123456",  // 载荷: 用户信息
  "exp": 1700000000    // 过期时间
}
.
xxxxx                  // 签名: 防篡改
```

### 本项目的认证流程

```
1. 用户登录 → POST /auth/login → 服务端验证密码(argon2)
2. 验证通过 → 生成 AccessToken → 存入 MongoDB + Redis → 返回 token
3. 前端保存 token → 后续请求 headers['access-token'] = token
4. 每次请求 → AuthenticationGuard 拦截 → 从 Redis/DB 查 token → 有效则放行
```

### Mini Demo: 简单的登录 + JWT

```bash
npm i @nestjs/jwt @nestjs/passport passport passport-jwt
```

```typescript
// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthService {
  // 假装有个用户数据库
  private users = [{ id: 1, username: 'admin', password: '123456' }]

  constructor(private jwtService: JwtService) {}

  // 登录: 验证用户名和密码
  login(username: string, password: string) {
    const user = this.users.find(
      u => u.username === username && u.password === password
    )
    if (!user) throw new Error('用户名或密码错误')

    // 生成 JWT token
    const token = this.jwtService.sign({ userId: user.id, username: user.username })
    return { token }
  }

  // 验证 token
  validateToken(token: string) {
    try {
      return this.jwtService.verify(token)
    } catch {
      return null
    }
  }
}
```

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'

@Module({
  imports: [
    JwtModule.register({
      secret: 'my-secret-key',  // 生产环境要用环境变量！
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

```typescript
// src/auth/auth.controller.ts
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password)
  }

  @Get('me')
  getMe(@Headers('authorization') token: string) {
    const user = this.authService.validateToken(token)
    if (!user) throw new UnauthorizedException()
    return user
  }
}
```

---

## 7. Redis 缓存 — 后端的 "本地缓存/SessionStorage"

### 类比

| 前端概念 | Redis 对应 |
|---------|-----------|
| `sessionStorage` | Redis（内存数据库，极快） |
| `sessionStorage.setItem(key, value)` | `redis.set(key, value)` |
| 数据有过期时间 | `redis.set(key, value, 'EX', 60)` |
| `Map` 对象 | Redis Hash |
| `localStorage` (持久化) | MongoDB (持久化) |

### 为什么需要 Redis？

数据库查询慢（磁盘 IO），Redis 在内存中，速度快 100 倍。常见场景：
- 用户登录信息缓存（不用每次都查数据库）
- 接口结果缓存（热门数据不用重复计算）
- 分布式锁（多个服务同时操作时的协调）

### 本项目中的 Redis 使用

```typescript
// libs/base/src/service/cache.service.ts
@Injectable()
export class CacheService {
  // 最核心的方法: 带缓存的查询
  async start(key: string, ttl: number, fn: Function) {
    // 1. 先查缓存，有就直接返回
    // 2. 缓存没有 → 执行 fn() 查数据库
    // 3. 把结果存入缓存
    // 4. 下次再查，直接从缓存读取
    return await this.cacheManager.wrap(key, fn, ttl)
  }
}

// 使用示例 — 认证守卫中缓存用户信息
const key = `auth.globel_user_${token}`
const user = await this.cacheService.start(key, 60, async () => {
  // 这个函数只在缓存过期时才执行
  return await this.authService.findUserByToken(token)
})
```

### Mini Demo: NestJS + Redis 缓存

```bash
# 启动 Redis
docker run -d -p 6379:6379 --name my-redis redis:7

# 安装依赖
npm i @nestjs/cache-manager cache-manager cache-manager-ioredis-yet ioredis
```

```typescript
// src/app.module.ts
import { CacheModule } from '@nestjs/cache-manager'
import { redisStore } from 'cache-manager-ioredis-yet'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const store = await redisStore({ host: 'localhost', port: 6379 })
        return { store, ttl: 60 * 1000 }  // 默认缓存60秒
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
// src/cat.controller.ts — 给接口加缓存
import { CacheInterceptor } from '@nestjs/cache-manager'

@Controller('cats')
@UseInterceptors(CacheInterceptor)  // 自动缓存 GET 请求结果
export class CatController {
  @Get()
  findAll() {
    console.log('查询数据库...')  // 第二次请求不会打印，因为走缓存
    return this.catService.findAll()
  }
}
```

---

## 8. RabbitMQ 消息队列 — 后端的 "事件总线"

### 类比

| 前端概念 | RabbitMQ 对应 |
|---------|--------------|
| `EventBus.$emit('export', data)` | 发送消息到队列 |
| `EventBus.$on('export', handler)` | 消费者监听队列 |
| 异步不阻塞 | 消息发出后立即返回，后台慢慢处理 |
| 前端 Web Worker | 消费者服务（另一个进程处理耗时任务） |

### 为什么需要消息队列？

场景：用户点击 "导出数据"（可能要5分钟），你不能让用户等5分钟。

**没有 MQ 的做法**：

```
用户点击导出 → 服务端处理5分钟 → 返回结果
                （用户一直等待...）
```

**用 MQ 的做法**：

```
用户点击导出 → 服务端发消息到队列 → 立即返回 "已提交"
                                    ↓ （后台异步）
                              export 服务从队列取消息
                                    ↓
                              慢慢处理5分钟
                                    ↓
                              处理完通知用户
```

### 本项目中的 RabbitMQ

**发送消息（生产者）**：

```typescript
// apps/scheduler/src/service/statistic.service.ts
@Injectable()
export class StatisticService {
  constructor(
    @Inject('STATISTIC_TASK') private readonly client: ClientProxy  // 注入MQ客户端
  ) {}

  async handler() {
    const tasks = await this.taskModel.find({ status: 'processing' })

    for (const task of tasks) {
      // 发送消息到队列 — 就像 EventBus.$emit()
      this.client
        .send('statistic_task', task._id + '')
        .subscribe()  // RxJS Observable, 需要 subscribe 触发
    }
  }
}
```

**接收消息（消费者）**：

```typescript
// apps/statistic/src/statistic.controller.ts
@Controller()
export class StatisticController {
  // 监听 statistic_task 消息 — 就像 EventBus.$on()
  @MessagePattern('statistic_task')
  async countTask(@Payload() data: string, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef()
    const originalMsg = context.getMessage()

    try {
      // 处理任务统计...
      await this.taskService.countTask(data)
      channel.ack(originalMsg)    // 确认消息已处理
    } catch (error) {
      channel.nack(originalMsg)   // 处理失败，消息重新入队
    }
  }
}
```

**本项目的队列列表**：

| 队列 | 消费者 | 场景 |
|------|--------|------|
| `prod_export_tasks` | export 服务 | 数据导出（生成文件、上传 MinIO） |
| `prod_statistic_tasks` | statistic 服务 | 统计计算（每日定时触发） |
| `prod_clean_tasks` | clean 服务 | 数据清理（删除批次、释放资源） |
| `ai_check` / `ai_label` | private-api | AI 自动标注/质检 |

### Mini Demo: NestJS + RabbitMQ

```bash
# 启动 RabbitMQ（带管理界面）
docker run -d -p 5672:5672 -p 15672:15672 --name my-rabbitmq rabbitmq:3-management
# 管理界面: http://localhost:15672  用户名/密码: guest/guest
```

```bash
npm i @nestjs/microservices amqplib amqp-connection-manager
```

**生产者 (HTTP 服务)**：

```typescript
// src/app.module.ts
import { ClientsModule, Transport } from '@nestjs/microservices'

@Module({
  imports: [
    ClientsModule.register([{
      name: 'TASK_QUEUE',
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://localhost:5672'],
        queue: 'my_tasks',
        queueOptions: { durable: false },
      },
    }]),
  ],
})
export class AppModule {}

// src/app.controller.ts
@Controller()
export class AppController {
  constructor(@Inject('TASK_QUEUE') private client: ClientProxy) {}

  @Post('send-task')
  sendTask(@Body() body: { message: string }) {
    // 发消息到队列
    this.client.send('process_task', body.message).subscribe()
    return { status: '任务已提交到队列' }
  }
}
```

**消费者 (MQ Worker 服务，另一个进程)**：

```typescript
// worker/main.ts
import { NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(WorkerModule, {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://localhost:5672'],
      queue: 'my_tasks',
      queueOptions: { durable: false },
    },
  })
  await app.listen()
  console.log('Worker 已启动，等待消息...')
}
bootstrap()

// worker/worker.controller.ts
@Controller()
export class WorkerController {
  @MessagePattern('process_task')
  handleTask(@Payload() data: string) {
    console.log('收到任务:', data)
    // 模拟耗时处理
    return `任务 "${data}" 处理完成`
  }
}
```

---

## 9. API 网关 — 后端的 "Nginx/反向代理"

### 类比

| 前端概念 | 后端网关 |
|---------|---------|
| `vue.config.js` 的 proxy 配置 | API 网关路由转发 |
| Nginx 反向代理 | 网关服务 |
| 前端的路由拦截 (beforeEach) | 网关的鉴权 + 限流 |

### 网关是什么？

所有请求先经过网关，网关负责：
1. **统一入口**：外部只看到 3000 端口
2. **路由分发**：`/api/*` → main 服务，`/open-api/*` → open-api 服务
3. **统一鉴权**：在网关层验证 token
4. **限流/熔断**：防止恶意请求

### 本项目的网关

```
客户端 → http://xxx:3000
              ↓
         ┌─ gateway ─┐
         │            │
         │ /api/*     │ → 转发到 main 服务 (3004)
         │ /open-api/*│ → 转发到 open-api 服务
         │ /admin/*   │ → 转发到 admin 服务
         └────────────┘
```

```typescript
// apps/gateway/src/app.controller.ts
@Controller()
export class AppController {
  constructor(private readonly mainService: MainService) {}

  // 把所有 /api/ 开头的请求转发到 main 服务
  @All('/api/*')
  async api(@Request() request) {
    return this.mainService.request(request)  // HTTP 内部调用
  }

  @All('/open-api/*')
  openApi(@Body() dto, @Request() request) {
    return this.openService.request(...)
  }
}
```

```typescript
// apps/gateway/src/service/main.service.ts — 内部 HTTP 转发
@Injectable()
export class MainService {
  async request(request) {
    // 类似前端 axios.request()，把请求原封不动转发到内部服务
    const result = await axios({
      url: `http://localhost:3004${request.originalUrl}`,
      method: request.method,
      data: request.body,
      headers: request.headers,
    })
    return result.data
  }
}
```

---

## 10. MinIO 对象存储 — 后端的 "CDN/文件服务"

### 类比

| 前端概念 | MinIO 对应 |
|---------|-----------|
| `<input type="file">` 上传 | 把文件上传到 MinIO |
| CDN 链接 | MinIO 返回的文件 URL |
| OSS（阿里云/腾讯云） | MinIO（自部署版 OSS） |

### MinIO 是什么？

MinIO 就是一个自己部署的 "阿里云 OSS"。你可以把文件（图片、压缩包、导出结果）上传到 MinIO，然后通过 URL 下载。

### 本项目的文件上传

```typescript
// apps/export/src/export/service/upload.service.ts
async minioOss(filepath: string, filename: string) {
  // 1. 创建 MinIO 客户端
  const client = new Client({
    endPoint: this.configService.get('storage.end_point'),
    port: this.configService.get('storage.port'),
    useSSL: false,
    accessKey: this.configService.get('storage.ak'),
    secretKey: this.configService.get('storage.sk'),
  })

  // 2. 上传文件到指定 bucket
  const fileData = fs.readFileSync(filepath)
  const bucket = this.configService.get('storage.bucket_list.export')
  await client.putObject(bucket, filename, fileData)

  // 3. 返回文件 URL
  return `http://minio-host:9000/${bucket}/${filename}`
}
```

### Mini Demo: 上传文件到 MinIO

```bash
# 启动 MinIO
docker run -d -p 9000:9000 -p 9001:9001 --name my-minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
# 管理界面: http://localhost:9001  用户名/密码: minioadmin/minioadmin
```

```bash
npm i minio
```

```typescript
// src/upload.service.ts
import { Injectable } from '@nestjs/common'
import { Client } from 'minio'

@Injectable()
export class UploadService {
  private minioClient: Client

  constructor() {
    this.minioClient = new Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
    })
  }

  async upload(file: Express.Multer.File) {
    const bucket = 'my-uploads'

    // 确保 bucket 存在
    const exists = await this.minioClient.bucketExists(bucket)
    if (!exists) await this.minioClient.makeBucket(bucket)

    // 上传文件
    const filename = `${Date.now()}-${file.originalname}`
    await this.minioClient.putObject(bucket, filename, file.buffer)

    return { url: `http://localhost:9000/${bucket}/${filename}` }
  }
}
```

---

## 11. 微服务架构 — 把一个大 App 拆成多个小 App

### 类比

| 单体应用(Monolith) | 微服务(Microservice) |
|--------------------|---------------------|
| 一个大型 Vue 项目 | 多个独立的子应用(微前端) |
| 所有功能在一个进程 | 每个功能独立进程 |
| 一个 package.json | 多个 apps/ 目录 |
| 挂了全挂 | 一个挂了其他正常 |

### 本项目的微服务架构

```
data-annotation-service/          ← Monorepo（代码在一起，运行分开）
├── apps/
│   ├── gateway/    → 进程1: 端口3000，负责路由
│   ├── main/       → 进程2: 端口3004，核心业务
│   ├── private-api/ → 进程3: 端口4000，内部API
│   ├── scheduler/  → 进程4: 定时任务
│   ├── statistic/  → 进程5: 统计计算（MQ消费者）
│   ├── clean/      → 进程6: 数据清理（MQ消费者）
│   └── export/     → 进程7: 导出处理（MQ消费者）
└── libs/
    ├── base/       → 共享代码（Schema, 工具函数, 常量）
    └── logger/     → 共享日志模块
```

### 服务间通信方式

```
                        HTTP 调用（同步）
gateway ──────────────────────────────→ main
gateway ──────────────────────────────→ private-api

                        RabbitMQ（异步）
main ────── 发消息 ────→ [队列] ────→ statistic
main ────── 发消息 ────→ [队列] ────→ export
scheduler ── 发消息 ────→ [队列] ────→ clean
```

**同步 vs 异步通信**：

| | HTTP 调用（同步） | MQ 消息（异步） |
|--|-------------------|-----------------|
| 类比 | `await axios.get()` | `EventBus.$emit()` |
| 等待结果 | 是 | 否 |
| 适合场景 | 查询接口、需要立即返回结果 | 耗时任务、不需要即时结果 |
| 失败处理 | 直接返回错误 | 消息重试（nack） |

### NestJS Monorepo 命令

```bash
# 每个服务独立启动
yarn debug:gateway      # 启动网关
yarn debug:main         # 启动主服务
yarn debug:export       # 启动导出服务
yarn debug:statistic    # 启动统计服务
yarn debug:clean        # 启动清理服务

# 构建
nest build main
nest build gateway
```

配置在 `nest-cli.json` 中：

```json
{
  "projects": {
    "main": { "root": "apps/main", "sourceRoot": "apps/main/src" },
    "gateway": { "root": "apps/gateway", "sourceRoot": "apps/gateway/src" },
    "export": { "root": "apps/export", "sourceRoot": "apps/export/src" },
    // ...
  }
}
```

---

## 12. 定时任务(Cron) — 后端的 "setInterval"

### 类比

| 前端概念 | 后端对应 |
|---------|---------|
| `setInterval(() => {}, 60000)` | `@Cron('* * * * *')` |
| 定时轮询 | Cron 表达式 |

### 本项目的定时任务

```typescript
// apps/scheduler/src/scheduler.service.ts
@Injectable()
export class SchedulerService {
  // 每天16:00执行统计
  @Cron('0 16 * * *')
  async dailyStatistic() {
    await this.statisticService.handler()
  }

  // 每天凌晨2:00执行清理
  @Cron('0 2 * * *')
  async dailyClean() {
    await this.cleanService.handler()
  }
}
```

### Cron 表达式速查

```
┌───────── 秒 (0-59)        可选
│ ┌─────── 分 (0-59)
│ │ ┌───── 时 (0-23)
│ │ │ ┌─── 日 (1-31)
│ │ │ │ ┌── 月 (1-12)
│ │ │ │ │ ┌ 周几 (0-7, 0和7都是周日)
* * * * * *

常用:
*/5 * * * *    → 每5分钟
0 */2 * * *    → 每2小时
0 16 * * *     → 每天16:00
0 0 * * 1      → 每周一0:00
```

---

## 13. Docker 与部署 — 后端的 "npm run build + 上线"

### 类比

| 前端概念 | Docker 对应 |
|---------|-----------|
| `npm run build` → dist 文件夹 | `docker build` → Docker 镜像 |
| 把 dist 放到 Nginx | 用 Docker 运行镜像 |
| `npm install` | Dockerfile 中的 `RUN npm install` |
| `.env` 文件 | `config.yml` 挂载 |

### Docker 三行理解

```bash
# 1. 构建镜像（相当于 npm run build）
docker build -t my-app .

# 2. 运行容器（相当于用 Nginx 部署 dist）
docker run -p 3000:3000 my-app

# 3. 本地开发用 docker-compose（一键启动所有依赖）
docker-compose up -d
```

### 本项目的 Dockerfile

```dockerfile
# build/main/Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/
COPY config/ ./config/

CMD ["node", "dist/apps/main/main.js"]
```

### Mini Demo: docker-compose 一键启动所有依赖

创建 `docker-compose.dev.yml`：

```yaml
version: '3'
services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"  # 管理界面

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"    # 管理界面
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"

volumes:
  mongo-data:
```

```bash
# 一键启动所有基础设施
docker-compose -f docker-compose.dev.yml up -d

# 查看运行状态
docker-compose -f docker-compose.dev.yml ps

# 停止
docker-compose -f docker-compose.dev.yml down
```

---

## 14. 本地环境搭建 & 30分钟跑起来

### 前置要求

| 软件 | 版本 | 安装方式 |
|------|------|---------|
| Node.js | ≥ 18 | 官网下载 |
| Docker Desktop | latest | 官网下载 |
| yarn | 1.x | `npm i -g yarn` |

### 步骤

```bash
# 1. 安装依赖
yarn install

# 2. 用 Docker 启动所有基础设施（MongoDB、Redis、RabbitMQ、MinIO）
#    使用上面 docker-compose.dev.yml

# 3. 修改配置文件
#    config/config.yml 中的连接地址改为 localhost

# 4. 启动网关 + 主服务（两个终端分别运行）
yarn debug:gateway     # 终端1: API 网关 → :3000
yarn debug:main        # 终端2: 核心业务 → :3004

# 5. 测试接口
curl http://localhost:3000/api/health
```

### 常见问题

| 问题 | 解决 |
|------|------|
| `argon2` 安装失败 | Windows 需要安装 Visual C++ Build Tools |
| MongoDB 连接超时 | 检查 Docker 容器是否运行: `docker ps` |
| 端口被占用 | `netstat -ano \| findstr :3000` 找到占用进程 |
| RabbitMQ 连接失败 | 确认 5672 端口开放，用户名密码正确 |

---

## 学习路线建议

按顺序，每步约 1-2 天：

```
Day 1-2:  NestJS 基础
          → 创建项目、写 Controller/Service/Module
          → 完成 "猫" CRUD Demo

Day 3-4:  MongoDB + Mongoose
          → 理解 Schema、Model、DAO 模式
          → 在 Demo 中连接 MongoDB

Day 5-6:  Redis 缓存 + JWT 认证
          → 给 Demo 加登录功能
          → 给 Demo 加缓存

Day 7-8:  RabbitMQ 消息队列
          → 理解生产者/消费者模式
          → 给 Demo 加异步导出功能

Day 9-10: 网关 + 微服务
          → 把 Demo 拆成网关 + 业务服务
          → 理解 Monorepo 结构

Day 11+:  阅读本项目源码
          → 从 gateway → main → 具体模块
          → 跟着一个完整请求走一遍流程
```

### 推荐资源

| 资源 | 链接 |
|------|------|
| NestJS 官方文档(中文) | https://docs.nestjs.cn/ |
| Mongoose 官方文档 | https://mongoosejs.com/docs/ |
| RabbitMQ 入门教程 | https://www.rabbitmq.com/tutorials |
| Docker 入门 | https://docs.docker.com/get-started/ |
| Redis 可视化工具 | Another Redis Desktop Manager |
| MongoDB 可视化工具 | MongoDB Compass (免费) |

---

> 💡 **Tips**：在阅读本项目代码时，建议从一个完整的请求链路入手 —— 比如 "用户登录" 这个功能，从 gateway 接收请求 → 转发到 main → AuthController → AuthService → UserDao → MongoDB，完整走一遍就能理解整个架构了。
