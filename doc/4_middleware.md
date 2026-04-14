### MiddleWare 是请求到达controller之前的一个函数，可以对请求进行预处理，或者对响应进行后处理。

http请求气泡图
Middleware(中间件) → Guard（权限守卫）→ Interceptor（拦截器）→ Pipe（数据校验转换器）→ Controller（控制器） → Interceptor（拦截器后置）
#### 最简单的中间件
```typescript
//logger.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
@Injectable()//这个装饰器让他成为Provider，可以被注入到Module里
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();//调用next()函数，继续执行下一个中间件或者controller
  }
}
```
#### 注册中间件（在Module中注册）
- 中间件不在@moudle里注册，而是实现NestModule接口
```typescript
// app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './logger.middleware';
import { UserController } from './user.controller';
@Module({
  controllers: [UserController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { //实现NestModule接口，重写configure方法
    consumer //consumer是MiddlewareConsumer类型的对象，可以用来注册中间件
      .apply(LoggerMiddleware) //应用中间件
      .forRoutes('user'); //指定中间件作用的路由，可以是字符串、数组或者正则表达式 所有路由为forRoutes('*')
  }
}
```

#### forRoutes路由控制
```ts
configure(consumer: MiddlewareConsumer) {
  consumer.apply(LoggerMiddleware).forRoutes('user'); //只对/user路由生效
  consumer.apply(LoggerMiddleware).forRoutes('*'); //对所有路由生效
  consumer.apply(LoggerMiddleware).forRoutes({ path: 'user', method: RequestMethod.GET }); //只对GET /user路由生效
  consumer.apply(LoggerMiddleware).forRoutes({ path: 'user', method: RequestMethod.ALL }); //对/user路由的所有请求方法生效
  consumer.apply(LoggerMiddleware).forRoutes(UserController); //对UserController的所有路由生效
  consumer.apply(LoggerMiddleware).forRoutes('user', 'product'); //对/user和/product路由生效
  consumer.apply(LoggerMiddleware).forRoutes(UserController, ProductController); //对UserController和ProductController的所有路由生效
  consumer.apply(LoggerMiddleware).exclude('user').forRoutes('*'); //对所有路由生效，但排除/user路由
}
```
#### 多个中间件： 链式调用
```ts
// auth.middleware.ts
@Injectable() //认证中间件
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {//改写use方法，添加认证逻辑
    const token = req.headers['authorization'];
    if(!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req['user'] = parseToken(token); //解析token，获取用户信息，存储在req对象中，供后续中间件或者controller使用
    next();
  }
}

// cors.middleware.ts
@Injectable() //跨域中间件
export class CorsMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {//改写use方法，添加跨域逻辑
        res.header('Access-Control-Allow-Origin', '*'); //允许所有来源
        next();
    }
}

// app.module.ts
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware, AuthMiddleware, CorsMiddleware) //链式调用多个中间件，按照顺序执行
    .forRoutes('*');
}
```
请求顺序: LoggerMiddleware → AuthMiddleware → CorsMiddleware → Controller

#### 函数式中间件(简单场景)
```ts
// logger.middleware.ts
export function logger(req: Request, res: Response, next: NextFunction) {
  console.log('Request...');
  next();
}
// app.module.ts
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(logger) //直接使用函数作为中间件
    .forRoutes('*');
}
```
#### 全局中间件 main.ts注册
```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerMiddleware } from './logger.middleware';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(LoggerMiddleware); //全局注册中间件，作用于所有路由
  await app.listen(3000);
}
bootstrap();
```



### Midderware VS Guard VS Interceptor 
```
Middleware                Guard                  Interceptor
─────────────────         ──────────────────     ──────────────────
Express 层面              NestJS 层面             NestJS 层面
不知道路由处理器           知道路由处理器           知道路由处理器
无法访问 DI 上下文         可以访问 DI 上下文       可以访问 DI 上下文
处理通用 HTTP 逻辑         处理权限/认证            处理响应转换/日志
next() 继续               返回 true/false         rxjs 操作符

适合做：                   适合做：                适合做：
- 日志                    - JWT 验证              - 统一响应格式
- CORS                    - 角色权限              - 接口耗时统计
- 限流                    - API Key 验证          - 缓存
- 请求体解析              - 黑白名单              - 异常转换
```
DI（Dependency Injection）上下文 是指依赖注入的上下文环境，Guard和Interceptor可以通过构造函数注入其他Provider来获取所需的服务，而Middleware无法直接访问DI上下文，需要通过其他方式来获取依赖。

### 完整的执行顺序
```
HTTP 请求进来
      ↓
  Middleware        → 通用处理：日志、CORS、解析 token
      ↓
  Guard             → 权限验证：有没有资格进来
      ↓
  Interceptor 前置  → 记录开始时间、参数处理
      ↓
  Pipe              → 数据校验和转换
      ↓
  Controller        → 业务处理
      ↓
  Interceptor 后置  → 统一响应格式、记录耗时
      ↓
HTTP 响应出去
```


### 小结
中间件三要素：
  req  → 请求对象，可以读取和修改
  res  → 响应对象，可以直接返回响应
  next → 必须调用！否则请求永远卡在这里

注册方式：
  精细控制 → Module 里实现 NestModule 接口
  全局生效 → main.ts 里 app.use()

核心场景：
  日志 / CORS / 限流 / Token 解析 / 请求格式化

一句话： Middleware 是请求的第一道关卡，负责通用预处理，确保请求合法、格式正确，为后续的权限验证和业务处理打好基础。