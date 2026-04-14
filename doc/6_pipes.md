> Pipe在请求到达controller之前，对请求数据进行验证(validation)和转换(transformation)，确保数据的合法性和正确性。
过程：Http请求 → Middleware(中间件) → Guard（权限守卫）→ Interceptor（拦截器）→ Pipe（数据校验转换器）→ Controller（控制器） → Service（服务） → 数据库
### Pipe的作用
- 验证：检查请求数据是否符合预期的格式和规则，例如必填字段、数据类型、长度等。如果验证失败，可以抛出异常，返回错误响应。
- 转换：将请求数据转换为所需的格式或类型，例如将字符串转换为数字、日期等。这样可以简化controller中的逻辑，确保数据的一致性。
### Pipe内置类
- ValidationPipe：使用class-validator库进行数据验证，支持DTO类的验证规则定义
- DefaultValuePipe：为缺失的参数提供默认值
- ParseIntPipe：将字符串参数转换为整数，如果转换失败会抛出异常
- ParseFloatPipe：将字符串参数转换为浮点数，如果转换失败会抛出异常
- ParseBoolPipe：将字符串参数转换为布尔值，如果转换失败会抛出异常
- ParseArrayPipe：将字符串参数转换为数组，如果转换失败会抛出异常
- ParseEnumPipe：将字符串参数转换为枚举值，如果转换失败会抛出异常
- ParseUUIDPipe：将字符串参数转换为UUID，如果转换失败会抛出异常
### 使用方式
正常传参 @Params('id') id:string
使用Pipe @Params('id',ParseIntPipe) id:number
```ts
// 没有Pipe时
@Get(':id')
findOne(@Param('id') id: string) {
  return this.userService.findOne(id); // id是字符串类型
}
// 使用Pipe后
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) { // id被转换为数字类型
  return this.userService.findOne(id); // id是数字类型
}
//parseBoolPipe
@Get()
findOne(@Query('isActive', ParseBoolPipe) isActive: boolean) {
  return this.userService.findOne(isActive); // isActive是布尔类型
}
//ParseUUIDPipe
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) {
  return this.userService.findOne(id); // id是UUID格式的字符串
}
//DefaultValuePipe
@Get()
findAll(@Query('page', new DefaultValuePipe(1)) page: number) {
  return this.userService.findAll(page); // page默认为1
}


// ValidationPipe
//CreateUserDto.ts
import { IsString, IsNotEmpty, IsEmail, IsInt, Min } from 'class-validator';
export class CreateUserDto {
  @IsString() // 必须是字符串
  @IsNotEmpty() // 不能为空
  name: string;

  @IsEmail() // 必须是邮箱格式
  email: string;

  @IsInt() // 必须是整数
  @Min(0) // 最小值为0
  age: number;

  @IsOptional() // 可选字段
  @IsString()
    bio?: string;

    @IsArray() // 必须是数组
    @ArrayNotEmpty() // 数组不能为空
    @IsString({ each: true }) // 数组中的每个元素必须是字符串
    tags: string[];
}
// controller.ts
import { Controller, Post, Body, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
// 使用ValidationPipe验证请求体参数，未全局注册时需要在这里使用new ValidationPipe()，全局注册后直接使用@Body()即可
  create(@Body(new ValidationPipe()) createUserDto: CreateUserDto) { 
    return this.userService.create(createUserDto); // createUserDto会被验证
  }
}
```


#### 全局注册 ValidationPipe
```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // 自动去除DTO中没有定义的属性
    forbidNonWhitelisted: true, // 如果请求体中有DTO中没有定义的属性，抛出异常
    transform: true, // 自动转换请求参数类型，例如将字符串转换为数字
    transformOptions: {
      enableImplicitConversion: true, // 启用隐式类型转换，例如将字符串转换为数字
    },
    disableErrorMessages:  process.env.NODE_ENV === 'production', // 启用详细的错误消息，默认值为false
    exceptionFactory: (errors) => {// 自定义异常工厂函数，接收验证错误数组作为参数，返回一个异常对象
        const messages = errors.map(err =>
            Object.values(err.constraints).join(', ')
            );
            return new BadRequestException({
                code: 400,
                message: messages,
                timestamp: new Date().toISOString(),
            });
        }
  })); // 全局注册ValidationPipe
  await app.listen(3000);
}
bootstrap();

// controller.ts 直接调用
import { Controller, Post, Body } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) { // 不需要再手动使用ValidationPipe，已经全局注册了
    return this.userService.create(createUserDto); // createUserDto会被验证
  }
}
```


#### 自定义Pipe
- 简单转换
```ts
// pipe/trim.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      return value.trim(); // 去除字符串两端的空格
    }
    if(typeof value === 'object' && value !== null) {
      for(const key in value) {
        if(typeof value[key] === 'string') {
          value[key] = value[key].trim(); // 去除对象属性值两端的空格
        }
      }
    }
    return value; // 如果不是字符串，直接返回原值
  }
}

// controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { TrimPipe } from './pipe/trim.pipe';
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}
    
    @Post()
    create(@Body(new TrimPipe()) createUserDto: CreateUserDto) { // 使用自定义的TrimPipe
        return this.userService.create(createUserDto); // createUserDto中的字符串属性会被TrimPipe处理
    }
}
```
- 复杂验证
```ts
// pipe/age-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
@Injectable()
export class AgeValidationPipe implements PipeTransform {
  transform(value: any) {
    const age = parseInt(value);
    if (isNaN(age) || age < 0 || age > 120) {
      throw new BadRequestException('Invalid age value'); // 抛出异常，返回错误响应
    }
    return age; // 返回转换后的年龄值
  }
}
// controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { AgeValidationPipe } from './pipe/age-validation.pipe';
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}
    
    @Post()
    create(@Body('age', new AgeValidationPipe()) age: number) { // 使用自定义的AgeValidationPipe验证age参数
        return this.userService.create({ age }); // age参数会被AgeValidationPipe验证和转换
    }
}
```
#### 嵌套对象检验
使用@ValidateNested()装饰器和@Type()装饰器来验证嵌套对象的属性
```ts
//dto/address.dto.ts
export class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  country: string;
}
//dto/create-user.dto.ts
import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from './address.dto';
export class CreateUserDto {
    @IsString()
    name: string;
    
    @ValidateNested()  // 告诉 class-validator 深入校验嵌套对象
    @Type(() => AddressDto)  // 告诉 class-transformer 如何实例化
    address: AddressDto;
    }
```


#### Pipe三种注册方式
- 方法级别：直接在controller的方法参数上使用Pipe装饰器
- 控制器级别：在controller类上使用@UsePipes装饰器
- 全局级别：在main.ts中使用app.useGlobalPipes()方法注册全局Pipe


#### 总结
```
Pipe 做两件事：
  验证 Validation  → 数据不合法 → 抛出 400，Controller 拿不到
  转换 Transform   → 数据类型转换 → Controller 拿到期望的类型

内置 Pipe：
  ParseIntPipe      字符串 → 数字
  ParseBoolPipe     字符串 → 布尔
  ParseUUIDPipe     校验 UUID 格式
  DefaultValuePipe  提供默认值
  ValidationPipe    DTO 全量校验（最常用）

全局配置（推荐）：
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,    // 剔除多余字段
    transform: true,    // 自动类型转换
  }))
```
一句话：Pipe 是 Controller 的"门前过滤器"，确保进入业务逻辑的数据是干净的、类型正确的、符合规则的，让 Service 专心处理业务，不用操心数据合不合法。