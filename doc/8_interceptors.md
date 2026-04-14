> Interceptor 可以在请求到达Controller之前和响应返回之前都插入逻辑，是唯一能同时处理请求和响应的东西
类似vue的axios的interceptor,spring的AOP(Aspect Oriented Programming 面向切面编程)，可以在不修改原有代码的基础上，增强函数的功能，达到横切关注点（Cross-cutting Concerns）的目的，比如日志、性能监控、统一响应格式等。

#### 执行步骤：
```
HTTP 请求
      ↓
  Middleware          通用处理：日志、CORS、解析 token
      ↓
  Guard               能不能进：JWT验证、角色权限
      ↓
  Interceptor 前置    记录开始时间、初始化上下文
      ↓
  Pipe                验证参数、转换类型
      ↓
  Controller          路由匹配、调用 Service
      ↓
  Service             业务逻辑、数据库操作
      ↓
  Interceptor 后置    统一响应格式、记录耗时、过滤字段
      ↓
  Exception Filter    捕获异常、格式化错误响应
      ↓
HTTP 响应
```


#### 对比
- Middleware 路由匹配前，处理通用 HTTP 逻辑，无法访问 NestJS 的 DI 上下文(Dependency Injection)
- Guard 路由匹配后，处理权限认证，能访问 NestJS 的 DI
- Pipe 路由匹配后，处理数据校验和转换，能访问 NestJS 的 DI
- Interceptor 路由匹配后，处理响应转换和日志，能访问 NestJS 的 DI，并且可以同时处理请求和响应

#### 基础结构
```typescript
// logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';//rxjs是一个库，提供了丰富的操作符和工具函数，用于处理异步数据流。在NestJS中，Interceptor的返回值通常是一个Observable对象，表示一个异步的数据流，可以通过rxjs的操作符来处理这个数据流，比如map、catchError等。
import { tap } from 'rxjs/operators';//tap是rxjs的一个操作符，用于在数据流中执行副作用操作，比如日志记录、性能监控等，而不改变数据流本身。在Interceptor中，我们可以使用tap来记录请求的开始时间和结束时间，从而计算接口的耗时。
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> { 
    //intercept方法是Interceptor的核心方法，接收两个参数：
    // ExecutionContext提供了当前请求的上下文信息，
    // CallHandler是一个函数，表示后续处理的逻辑，可以通过调用它来继续处理请求
    const now = Date.now();
    console.log(`Request started at ${now}`);
    return next
      .handle() //继续处理请求，返回一个Observable对象，表示后续处理的结果
      .pipe( //使用rxjs的pipe方法来处理这个Observable对象，可以链式调用多个操作符
        tap(() => { //使用tap操作符来执行副作用操作，这里记录请求结束的时间和计算耗时
          const end = Date.now();
          console.log(`Request ended at ${end}, duration: ${end - now}ms`);
        }),
      );
  }
}
```
##### 理解next.handle()和rxjs
next.handle()是一个函数，表示后续处理的逻辑，调用它会继续处理请求，并返回一个Observable对象，表示后续处理的结果。我们可以使用rxjs的操作符来处理这个Observable对象，比如map、catchError、tap等，从而在请求和响应的不同阶段插入我们的逻辑。   
pipe方法是rxjs的一个函数，用于链式调用多个操作符，对Observable对象进行处理。
```
next.handle() 之前  →  前置逻辑（请求阶段）
next.handle()       →  交给 Controller 处理
next.handle() 之后  →  后置逻辑（响应阶段）

类比 axios：
axios.interceptors.request  →  next.handle() 之前
axios.interceptors.response →  next.handle().pipe(...)
```
#### RxJS操作符
- map：对数据流中的每个值进行转换，类似于Array的map方法
- catchError：捕获数据流中的错误，并返回一个新的Observable对象，类似于try-catch
- tap：执行副作用操作，不改变数据流本身，类似于Array的forEach
- timeout：设置超时时间，如果数据流超过这个时间没有完成，就抛出一个超时错误
- finalize：无论数据流成功还是失败，都会执行这个操作，可以用来清理资源等，类似于try-finally
```ts
import { map, catchError, tap, timeout, finalize } from 'rxjs/operators';
import { throwError } from 'rxjs';
next.handle()
  .pipe(        //链式调用多个操作符
    map(data => ({ data, timestamp: new Date().toISOString() })), // 对响应数据进行转换，添加一个timestamp字段
    catchError(err => throwError(() => new Error('Something went wrong'))), // 捕获错误并返回一个新的错误对象
    tap(() => console.log('Request processed')), // 执行副作用操作，记录日志
    timeout(5000), // 设置超时时间，如果请求超过5秒没有完成，就抛出一个超时错误
    finalize(() => console.log('Request finalized')), // 无论成功还是失败，都会执行这个操作，可以用来清理资源等
  );
```

#### 实战一：统一响应格式
```ts
// 期望格式
{
  code: 200,
  message: 'Success',
  data: {...},
  timestamp: '2024-06-01T12:00:00.000Z'
}
// interceptor/response.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
        map(data => ({
            code: 200,
            message: 'Success',
            data,
            timestamp: new Date().toISOString(),
        })),
        );
    }
}


```
#### 实战二： 接口耗时日志
```ts
// interceptor/logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest(); //获取请求对象，可以从中获取请求的URL、方法等信息
    const {method, url} = request;
    const start = Date.now();

    return next
      .handle()
      .pipe(
        tap(
            {
                next: () => {
                    const duration = Date.now() - start;
                    console.log(`${method} ${url} - ${duration}ms`); //记录接口的耗时日志
                },
                error: (err) => {
                    const duration = Date.now() - start;
                    console.log(`${method} ${url} - ${duration}ms - Error: ${err.message}`); //记录接口的耗时日志和错误信息
                }
            },
        ),
      );
  }
}
```

#### 实战三：接口缓存
```ts
// interceptor/cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
@Injectable()
export class CacheInterceptor implements NestInterceptor {
    private cache = new Map<string, any>(); //简单的内存缓存，可以替换成Redis等分布式缓存
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();

        const { method, url } = request;
        if(method !== 'GET') { //只缓存GET请求
            return next.handle();
        }

        const key = `${method}:${url}`; //缓存的key，可以根据请求的方法和URL来生成

        if (this.cache.has(key)) {
            return of(this.cache.get(key)); //如果缓存中有数据，直接返回一个Observable对象，包含缓存的数据
        }
        // 60s钟后过期
        return next.handle().pipe(
            tap(data => {
                this.cache.set(key, data);
                setTimeout(() => this.cache.delete(key), 60000); // 60秒后删除缓存
            }), //如果没有缓存，继续处理请求，并在响应后将数据存入缓存
        );
    }
}

```
#### 实战四：超时处理
```ts
// interceptor/timeout.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            timeout(5000), //设置超时时间，如果请求超过5秒没有完成，就抛出一个超时错误
            catchError(err => {
                if (err.name === 'TimeoutError') {
                    return throwError(() => new RequestTimeoutException('Request timed out')); //抛出一个请求超时异常
                }
                return throwError(() => err); //其他错误继续抛出
            }),
        );
    }
}
```
#### 实战五：敏感字段过滤
```ts
// interceptor/sensitive.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
@Injectable()
export class SensitiveInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map(data => this.filterSensitiveData(data)), //在响应数据返回之前，过滤掉敏感字段
        );
    }
    private filterSensitiveData(data: any): any {
        if (data && typeof data === 'object') {
            const { password, ...rest } = data; //假设响应数据中有一个password字段，我们要过滤掉它
            return rest; //返回过滤后的数据
        }
        return data; //如果不是对象，直接返回原数据
    }
}
```

#### 配合自定义装饰器：灵活配置
```ts
// decorators/skip.interceptor.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const Raw = () => SetMetadata('raw', true); //定义一个自定义装饰器，用于设置路由处理器的元数据，表示跳过某些Interceptor的处理

// interceptor/transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
@Injectable()
export class TransformInterceptor implements NestInterceptor {
    constructor(private reflector: Reflector) {} //注入Reflector，用于读取路由处理器的元数据
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const isRaw = this.reflector.getAllAndOverride<boolean>('raw', [
            context.getHandler(),
            context.getClass(),
        ]); //检查当前路由处理器是否设置了@Raw装饰器
        if (isRaw) {
            return next.handle(); //如果设置了@Raw装饰器，跳过这个Interceptor的处理，直接继续处理请求
        }
        return next.handle().pipe(
            map(data => ({ data, timestamp: new Date().toISOString() })), //如果没有设置@Raw装饰器，正常执行这个Interceptor的逻辑，对响应数据进行转换
        );
    }
}
// controllers/user.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Raw } from '../decorators/skip.interceptor.decorator';
@Controller('users')
export class UserController {
    @Get('raw')
    @Raw() //这个路由处理器设置了@Raw装饰器，表示跳过TransformInterceptor的处理，直接返回原始数据
    getRawUser() {
        return { id: 1, name: 'John', password: 'secret' }; //返回原始数据，包含敏感字段password
    }
    @Get()
    getUser() {
         return { id: 1, name: 'John', password: 'secret' }; //返回数据，会被TransformInterceptor处理，添加一个timestamp字段，但没有过滤掉password字段，因为这个Interceptor没有实现敏感字段过滤的逻辑
    }
}
```
#### 注册方式
- 方法级别：直接在Controller的方法上使用@UseInterceptors装饰器，指定要使用的Interceptor，这样只有这个方法会被这个Interceptor处理。
```ts
@Get()
@UseInterceptors(LoggingInterceptor) //只对这个方法生效
findAll() {
    return [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
}
```
- 控制器级别：在Controller类上使用@UseInterceptors装饰器，指定要使用的Interceptor，这样这个Controller的所有方法都会被这个Interceptor处理。
```ts
@UseInterceptors(LoggingInterceptor) //对整个控制器生效
@Controller('users')
export class UserController {
    // ...
}
```
- 全局级别：在main.ts中使用app.useGlobalInterceptors()方法，指定要使用的Interceptor，这样整个应用的所有路由都会被这个Interceptor处理。
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new LoggingInterceptor()); //全局注册Interceptor，作用于所有路由
  await app.listen(3000);
}
bootstrap();
```
### 总结
```
Interceptor 两个阶段：
  前置（next.handle() 之前） → 记录时间、初始化
  后置（next.handle().pipe） → 转换数据、记录日志

常用 RxJS 操作符：
  map        → 转换响应数据（统一格式）
  tap        → 副作用处理（日志、统计）
  catchError → 异常处理
  timeout    → 超时控制
  finalize   → 清理工作

四大核心场景：
  统一响应格式    TransformInterceptor
  接口耗时日志    LoggingInterceptor
  接口缓存        CacheInterceptor
  超时处理        TimeoutInterceptor
```

一句话： Interceptor 是 NestJS 的 axios 拦截器，能同时切入请求和响应两个阶段，基于 RxJS 的流式处理让它在统一响应格式、性能监控、缓存等场景下非常优雅，是生产项目中使用频率最高的概念之一。