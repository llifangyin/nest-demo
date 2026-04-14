> Guard： 决策当前请求有没有资格继续执行，返回true继续执行，返回false拒绝（403）
请求流程： Http请求 -> Middleware -> Guard -> Interceptor ->Pipe ->  Controller
类似于vue的beforeEach
#### Middleware vs Guard
```
Middleware                        Guard
──────────────────────────────    ──────────────────────────────
不知道路由处理器是谁               知道路由处理器是谁
无法访问 ExecutionContext          可以访问 ExecutionContext
不知道这个路由需要什么权限          可以读取路由的元数据（@SetMetadata）

适合：日志、CORS、解析 token       适合：验证 token、角色权限控制


```

#### 最简单的Guard
```typescript
// auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {//CanActivate 是一个接口，定义了canActivate方法，返回boolean或者Promise<boolean> ，这个Guard是否允许继续执行
  canActivate(context: ExecutionContext): boolean {//ExecutionContext 是一个接口，提供了当前请求的上下文信息，可以通过它获取请求对象、响应对象、处理器函数等
    const request = context.switchToHttp().getRequest();//通过ExecutionContext获取请求对象 
    const token = request.headers['authorization'];
    if (token === 'valid-token') {
      return true; // 继续执行
    }
    throw new UnauthorizedException('Invalid token'); // 拒绝访问
  }
}
```

#### ExecutionContext ：Guard核心能力
ExecutionContext是Guard比Middleware强大的原因，他知道当前请求要求哪个Controller的那个方法。
```typescript
canActivate(context: ExecutionContext): boolean {
    //1 获取http请求信息
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    // 2 获取当前路由处理器信息
    const handler = context.getHandler(); //获取当前路由处理器函数 , 比如方法findOne
    const controller = context.getClass(); //获取当前控制器类 , 比如UserController
    // 3 获取路由处理器的元数据 （配合 @SetMetadata 做权限控制）
    const metadata = this.reflector.get<string>('roles', handler); //获取路由处理器上的@SetMetadata('roles', ['admin'])设置的元数据
    // 4 支持多种协议（http、websocket、rpc等）
    context.switchToWs(); //获取WebSocket的请求对象
    context.switchToRpc(); //获取RPC的请求对象
    context.getType(); //获取当前请求的协议类型，返回'http'、'ws'、'rpc'等

}
```

#### 实战
1. JWT身份验证Guard(JWT：JSON Web Token，是一种常用的身份验证方案，客户端登录后会获得一个JWT token，后续请求携带这个token，服务器验证token的有效性来判断用户身份)
```ts
//giards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) {} //注入JwtService，用于验证token
    

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request); //从请求中提取token的方法，可以根据实际情况实现
        if (!token) {
        throw new UnauthorizedException('No token provided');
        }
        try {
            const payload = await this.jwtService.verifyAsync(token,{
                secret:process.env.JWT_SECRET, //验证token的密钥，可以从环境变量中获取
            });
            request['user'] = payload; //将解析后的用户信息存储在请求对象中，供后续的Guard或者Controller使用
        } catch (err) {
         throw new UnauthorizedException('Invalid token');
        }
        return true; // token验证成功，继续执行
    }f
    private extractToken(request: Request): string | null {
      const [type, token] = request.headers['authorization']?.split(' ') ?? [];
      return type === 'Bearer' ? token : null;
    }
}
```
2. 角色权限Guard
```ts

//decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: string[]) => SetMetadata('roles', roles); //定义一个自定义装饰器，用于设置路由处理器的角色权限元数据
//使用效果 @Roles('admin') //表示这个路由处理器需要admin角色才能访问
// Nest如何读取decoreators里的装饰器？ 通过Reflector这个工具类，结合ExecutionContext获取当前路由处理器的元数据
// Reflector是Nest提供的一个工具类，可以用来读取路由处理器上的元数据（通过@SetMetadata设置的元数据）。在Guard中，我们可以注入Reflector，然后通过它获取当前路由处理器的角色权限元数据，从而实现基于角色的权限控制。
//guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext ,ForbiddenException} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {} //注入Reflector，用于读取路由处理器的元数据
    
    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.get<string[]>('roles', [
            context.getHandler(), //获取当前路由处理器函数
            context.getClass(), //获取当前控制器类
        ]); //获取当前路由处理器的角色权限元数据
        if (!requiredRoles || requiredRoles.length === 0) {
            return true; //如果没有设置角色权限，默认允许访问
        }

        const request = context.switchToHttp().getRequest();//获取请求对象
        const user = request['user']; //从请求对象中获取用户信息，假设之前的JWT Guard已经将用户信息存储在请求对象中
        if (!user) {
            throw new ForbiddenException('No user information found');
        }

        const hasRole = requiredRoles.some(role => user.roles?.includes(role)); //检查用户是否具有所需的角色权限
        if (!hasRole) {
            throw new ForbiddenException('Insufficient permissions');
        }
        return true; //用户具有所需的角色权限，继续执行
    }
}


// controllers/user.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
@Controller('users')
export class UserController {
    @Get()
    @Roles('admin') //只有admin角色才能访问这个路由处理器
    findAll() {
        return [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
    }

    @Get('profile')
    @Roles('user', 'admin') //user和admin角色都能访问这个路由处理器
    getProfile() {
        return { id: 1, name: 'John', roles: ['user'] };
    }
}
```
3. 公开路由（跳过Guard）
全局注册了JWTAuthGuard后，所有路由都会被这个Guard保护，如果有些路由需要公开访问，可以在这些路由处理器上设置一个特殊的元数据，比如@Public()，然后在Guard中检查这个元数据，如果存在就跳过权限验证。
```ts
//decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true); //定义一个@Public装饰器，设置一个特殊的元数据，表示这个路由处理器是公开的

//guards/jwt-auth.guard.ts
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private jwtService: JwtService, private reflector: Reflector) {} //注入Reflector，用于读取路由处理器的元数据

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]); //检查当前路由处理器是否设置了@Public装饰器
        if (isPublic) {
            return true; //如果是公开路由，跳过权限验证，直接允许访问
        }
        // ...继续执行之前的权限验证逻辑
    }
}

// controllers/auth.controller.ts
import { Controller, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
@Controller('auth')
export class AuthController {
    @Post('login')
    @Public() //登录路由是公开的，不需要权限验证
    login() {
        return { token: 'valid-token' };
    }

```

#### Guard的三种注册方式
- 方法级别：直接在Controller的方法上使用@UseGuards装饰器，指定要使用的Guard，这样只有这个方法会被这个Guard保护。
```ts
@Get()
@UseGuards(AuthGuard) //只对这个方法生效
findAll() {
    return [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
}
```
- 控制器级别：在Controller类上使用@UseGuards装饰器，指定要使用的Guard，这样这个Controller的所有方法都会被这个Guard保护。
```ts
@UseGuards(AuthGuard) //对整个控制器生效
@Controller('users')
export class UserController {
    // ...
}
```
- 全局级别：在应用程序的根模块中使用APP_GUARD提供者，将Guard注册为全局Guard，这样整个应用程序的所有路由都会被这个Guard保护。
```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './guards/auth.guard';
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard, //将AuthGuard注册为全局Guard
    },
  ],
})
export class AppModule {}
```
#### 完整的权限系统设计
```
// 1. 装饰器
@Public()              // 公开路由
@Roles('admin')        // 角色限制

// 2. Guard 执行链
JwtAuthGuard           // 验证 token，把 user 挂到 request
    ↓
RolesGuard             // 读取 @Roles，对比 user.roles

// 3. Controller 使用
@Controller('articles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArticlesController {

  @Public()
  @Get()
  findAll() {}              // 所有人可读

  @Get(':id')
  findOne() {}              // 登录用户可读

  @Roles('editor', 'admin')
  @Post()
  create() {}               // editor/admin 可创建

  @Roles('admin')
  @Delete(':id')
  remove() {}               // 只有 admin 可删除
}
```

### 总结
```
Guard 核心：
  canActivate() 返回 true  → 放行
  canActivate() 返回 false → 403 Forbidden
  throw Exception          → 对应状态码

两大使用场景：
  ① 身份验证  JwtAuthGuard   → 验证 token 是否有效
  ② 权限控制  RolesGuard     → 验证角色是否满足要求

配套工具：
  @SetMetadata / 自定义装饰器  → 给路由打标签
  Reflector                   → 在 Guard 里读取标签
  ExecutionContext             → 获取请求信息和路由信息

注册顺序：
  全局 Guard → 控制器 Guard → 方法 Guard
  （永远先执行外层的）
```

一句话：Guard 是 NestJS 的权限卫士，负责决定请求是否有资格继续执行，核心方法是 canActivate()，可以基于路由的元数据实现灵活的权限控制。