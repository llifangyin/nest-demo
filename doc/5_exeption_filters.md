> Exception Filter是nestjs的全局异常捕获机制，可以捕获控制器或服务中抛出的异常，并进行统一处理。它可以捕获HTTP异常、运行时异常等，并返回自定义的错误响应。
```ts
HTTP 请求
      ↓
  Middleware
      ↓
  Guard
      ↓
  Controller / Service   ← 这里抛出异常
      ↓
  ××× 异常往上冒泡 ×××
      ↓
[ Exception Filter ]    ← 在这里统一捕获处理
      ↓
HTTP 响应（格式化的错误信息）
```
类比app.config.errorHandler
#### NestJs内置异常http类
- HttpException：所有HTTP异常的基类，接受一个消息和一个状态码
- BadRequestException：400错误，表示请求无效
- UnauthorizedException：401错误，表示未授权
- ForbiddenException：403错误，表示禁止访问
- NotFoundException：404错误，表示资源未找到
- InternalServerErrorException：500错误，表示服务器内部错误
- NotImplementedException：501错误，表示功能未实现
- BadGatewayException：502错误，表示网关错误
- ServiceUnavailableException：503错误，表示服务不可用
```ts
//在service或controller里抛出异常
import { BadRequestException, NotFoundException } from '@nestjs/common';
export class UserService {
  findOne(id: string) {
    const user = this.users.find(user => user.id === +id);
    if (!user) {
      throw new NotFoundException('User not found'); // 抛出404错误
    }
    return user;
  }
  create(user: { name: string }) {
    if (!user.name) {
      throw new BadRequestException('Name is required'); // 抛出400错误
    }
    const newUser = { id: Date.now(), ...user };
    this.users.push(newUser);
    return newUser;
  }
}
```

#### 基础异常类 HttpException 
```ts
throw new HttpException('Custom error message', HttpStatus.BAD_REQUEST); // 抛出自定义错误
throw new HttpException({ message: 'Custom error message', code: 'CUSTOM_ERROR' }, HttpStatus.BAD_REQUEST); // 抛出自定义错误对象
```

#### 自定义异常类
```ts
export class CustomException extends HttpException {
  constructor() {
    super('Custom error message', HttpStatus.BAD_REQUEST); // 调用父类构造函数，传入错误消息和状态码
  }
}
``` 
#### 自定义Exception Filter(错误格式)
```ts
//filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
@Catch(HttpException) // 捕获HttpException及其子类的异常   @Catch表示这个类是一个异常过滤器，参数是要捕获的异常类型，可以是单个异常类，也可以是多个异常类的数组，或者不传参数表示捕获所有异常
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) { //catch方法接受两个参数：exception是捕获到的异常对象，host是一个ArgumentsHost对象，可以用来获取请求和响应对象
        const ctx = host.switchToHttp(); //获取HTTP上下文
        const response = ctx.getResponse(); //获取响应对象
        const request = ctx.getRequest(); //获取请求对象
        const status = exception.getStatus(); //获取异常的状态码
        const message = exception.message || null; //获取异常的消息

        response.status(status).json({ //返回格式化的错误响应
         statusCode: status,
          timestamp: new Date().toISOString(),
          path: request.url,
          message: message,
        });
    }
}
```

#### 注册Filter的方式
- 方法级别
```ts
@Controller('users')
export class UserController {
  @Get(':id')
  @UseFilters(HttpExceptionFilter) // 只对这个方法生效 UseFilters是一个装饰器，可以用来绑定一个或多个异常过滤器到控制器的方法上。当方法抛出异常时，绑定的过滤器会被调用来处理异常。
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }
}
``` 
- Controller级别
```ts
@Controller('users')
@UseFilters(HttpExceptionFilter) // 对整个控制器生效
export class UserController {
}
```
- 全局级别
```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter()); // 全局注册异常过滤器
  await app.listen(3000);
}
bootstrap();
```
或者在Module里全局注册
```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
@Module({
  providers: [
    {
      provide: APP_FILTER, // 使用APP_FILTER令牌注册全局异常过滤器
      useClass: HttpExceptionFilter, // 指定使用HttpExceptionFilter类作为全局异常过滤器
    },
  ],
})
```

### 总结
- Exception Filter是nestjs的全局异常捕获机制，可以捕获控制器或服务中抛出的异常，并进行统一处理。
- NestJs内置了多种HTTP异常类，可以直接使用，也可以自定义异常类。
- 可以通过@Catch装饰器定义自定义异常过滤器，捕获特定类型的异常，并返回自定义的错误响应。
- 可以在方法级别、控制器级别或全局级别注册异常过滤器，根据需要选择合适的注册方式。

一句话： Exception Filter是NestJS的全局异常捕获机制，可以捕获控制器或服务中抛出的异常，并进行统一处理，返回自定义的错误响应。