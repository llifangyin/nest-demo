## @装饰器
NestJS装饰器
### 类装饰器，加在class上，定义类的类型
- @Controller() 定义控制器类，接收http请求 
- @Module() 定义模块类，组织代码结构
- @Injectable() 定义可注入类，提供依赖注入功能
- @Guard() 定义守卫类，控制请求的访问权限
- @Interceptor() 定义拦截器类，处理请求和响应的逻辑
- @Pipe() 定义管道类，处理请求数据的验证和转换
- @Filter() 定义异常过滤器类，处理请求中的异常
### 方法装饰器，加在方法上，定义路由和请求类型
- 路由类：@Get @Post @Put @Delete @Patch @Options @Head
- 响应类 @HttpCode @Redirect @Header
- 切面类 @UseGuards(意思是使用守卫) 、@UseInterceptors、@UsePipes、@UseFilters
### 参数装饰器，加在方法参数上，定义参数来源和类型
- @Param() 获取路由参数
- @Query() 获取查询参数
- @Body() 获取请求体参数
- @Headers() 获取请求头参数
### 属性装饰器，加在属性上，定义依赖注入
- @Inject() 注入依赖
- @class-validator装饰器 定义DTO类的验证规则
- @nestjs/swagger装饰器 定义Swagger文档的属性描述

1. 基础结构

接收http请求，交给service处理，返回结果
```ts
import { Controller, Get, Post, Put, Delete, 
         Param, Query, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')  // 路由前缀，所有的方法都会以/users开头
export class UserController {
  constructor(private userService: UserService) {} // 注入service 同Spring里的@Autowired

  @Get() // get请求，路由为/users
  async findAll() {
    return this.userService.findAll(); // 调用service的方法
  }

  @Get(':id') // get请求，路由为/users/:id
  async findOne(@Param('id') id: string) { // 获取路由参数
    return this.userService.findOne(id); // 调用service的方法
  }
  @Post() // post请求，路由为/users
    async create(@Body() user: CreateUserDto) { // 获取请求体参数
        return this.userService.create(user); // 调用service的方法
    }
  @Put(':id') // put请求，路由为/users/:id
    async update(@Param('id') id: string, @Body() user: CreateUserDto) { // 获取路由参数和请求体参数
        return this.userService.update(id, user); // 调用service的方法
    }
    @Delete(':id') // delete请求，路由为/users/:id
    remove(@Param('id') id: string) { // 获取路由参数
        return this.userService.remove(id); // 调用service的方法
    }
}   
```

2. 参数装饰器
```ts
@Get(':id')
findOne(
  @Param('id') id: string, // 获取路由参数
  @Query('name') name: string, // 获取查询参数
  @Body() body: CreateUserDto, // 获取请求体参数
  @Headers('authorization') auth: string, // 获取请求头参数

)
```
3. 嵌套路由&通配符
```ts
@Controller('users')
export class UserController {
  @Get(':id/profile') // 嵌套路由，路由为/users/:id/profile
  getProfile(@Param('id') id: string) {
    return this.userService.getProfile(id);
  }

  @Get('*') // 通配符路由，匹配所有未定义的路由
  notFound() {
    return { message: 'Not Found' };
  }

  @Get('ab*cd') // 通配符路由，匹配以ab开头，cd结尾的路由  
  wildcard() {
    return { message: 'Wildcard' };
}
```


4. 响应码
```ts
import { HttpCode, HttpStatus, Redirect, Header } from '@nestjs/common';
@Controller('users')
export class UserController {

  @Post ()
  @HttpCode(HttpStatus.OK) // 设置响应码为200
  create(@Body() user: CreateUserDto) {
    return this.userService.create(user);
  }
  @Get()
  @Header('Cache-Control', 'none') // 设置响应头
  findAll() {
    return this.userService.findAll();
  }

  @Get('redirect')
  @Redirect('https://nestjs.com', 302) // 重定向到nestjs官网
  redirect() {
    return; // 不需要返回值，重定向会自动处理
  }

}

```

5.DTO(数据传输对象)
DTO是一个设计模式，用于定义数据结构和验证规则，通常用于请求体参数的验证和类型定义。
```ts
//dto/create-user.dto.ts
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
export class CreateUserDto {
  @IsString()
  name: string;
  @IsEmail()
  email: string;
  @IsNotEmpty()
  password: string;
}

//controller.ts 配合ValidateionPipie自动验证请求体参数
@Post()
create(@Body() user:CreateUserDto){
  return this.userService.create(user);
}

```

6. 注册到Module 
Controller写完必须注册到Module里才能生效
```ts
//users.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './users.controller';
import { UserService } from './users.service';
@Module({
  controllers: [UserController], // 注册Controller
  providers: [UserService], // 注册Service
})
export class UsersModule {}

//app.module.ts 根模块
import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
@Module({ // 根模块需要导入子模块
  imports: [UsersModule], // 导入UsersModule
})  
export class AppModule {}
``` 


#### 总结：
- Controller是NestJS中处理HTTP请求的核心组件，通过装饰器定义路由和请求类型。
- 可以使用参数装饰器获取路由参数、查询参数、请求体参数和请求头参数。
- 可以使用嵌套路由和通配符路由来处理复杂的路由需求。
- 可以使用响应装饰器设置响应码、响应头和重定向。
- DTO是一个设计模式，用于定义数据结构和验证规则，通常用于请求体参数的验证和类型定义。
- Controller必须注册到Module里才能生效，Module是NestJS的功能边界，组织代码结构和依赖关系。

一句话： Controller是NestJS中处理HTTP请求的核心组件，通过装饰器定义路由和请求类型，可以使用参数装饰器获取请求参数，使用响应装饰器设置响应信息，DTO定义数据结构和验证规则，Controller必须注册到Module里才能生效。