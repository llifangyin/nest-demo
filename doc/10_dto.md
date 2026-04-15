> dto(data transfer object) 数据传输对象，定义客户端和服务端之间传输的数据结构，通常使用类来定义。

类比vue的props或者表单验证rules，spring的@RequestBody，数据库里的表结构Schema

#### DTO与Interface的区别
```
Interface           Class DTO
──────────────      ──────────────────
只有类型检查         类型检查 + 运行时校验
编译后消失           编译后存在
不能加装饰器         可以加 class-validator 装饰器
不能做数据转换       可以配合 class-transformer 转换数据

```
Nestjs中Dto必须使用class，不能使用interface，因为运行时要校验需要的类的元数据


#### 全局校验
```typescript
//main.ts
app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // 去掉请求中没有在DTO中定义的属性
    forbidNonWhitelisted: true, // 如果请求中有未定义的属性，抛出异常
    transform: true, // 自动转换请求数据类型
}));
```

#### DTO示例
```typescript
//create-user.dto.ts
import { IsString, IsInt, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @MinLength(4)
    username: string;

    @IsInt()
    age: number;
}
```
#### 使用DTO
```typescript
//user.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';

@Controller('users')
export class UserController {
    @Post()
    createUser(@Body() user: CreateUserDto) {
        // 处理创建用户的逻辑
        return this.userService.create(user);
    }
}
```
#### 继承
```typescript
//update-user.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
// PartialType 是Nest提供的一个工具函数，可以将CreateUserDto的所有属性变为可选，并且保留原有的验证规则
export class UpdateUserDto extends PartialType(CreateUserDto) {
    // 继承CreateUserDto的属性，并且所有属性变为可选
}
```

#### dto工具
- PartialType 所有字段变为可选
- RequiredType 所有字段变为必填
- PickType 选择部分字段
- OmitType 去掉部分字段
- IntersectionType 交叉类型，合并多个DTO的字段
```typescript
// 原始dto
export class CreateUserDto {
    username: string;
    email: string;
    age: number;
    password: string;
    role: string;
}
export class AdminDto {
    adminLevel: number;
}
export class UpdateUserDto extends PartialType(CreateUserDto) {
    // 继承CreateUserDto的属性，并且所有属性变为可选
}
export class UserProfileDto extends PickType(CreateUserDto, ['username', 'email']) {
    // 选择CreateUserDto中的username和email字段
}
export class UserWithoutPasswordDto extends OmitType(CreateUserDto, ['password']) {
    // 去掉CreateUserDto中的password字段
}
export class AdminUserDto extends IntersectionType(CreateUserDto, AdminDto) {
    // 合并CreateUserDto和AdminDto的字段
}
```

#### 嵌套dto
使用@Type装饰器来指定嵌套对象的类型，使用ValidateNested装饰器来验证嵌套对象的属性
```typescript
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
export class AddressDto {
    @IsString()
    street: string;

    @IsString()
    city: string;
}
export class CreateUserDto {
    @IsString()
    username: string;

    @ValidateNested()// 验证嵌套对象
    @Type(() => AddressDto) // 指定嵌套对象的类型
    address: AddressDto;
}
```

#### 数据转换（transform）
使用class-transformer库来自动转换请求数据的类型，例如将字符串转换为数字，
```typescript
import { Type } from 'class-transformer';
import { IsString, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateUserDto {
    //收尾去空格
    @Transform(({ value }) => value?.trim()) // 将字符串转换为数字
    @IsString()
    username: string;
    //转小写
    @Transform(({ value }) => value?.toLowerCase()) // 将字符串转换为数字
    @IsString()
    email: string;
    //转数字
    @Transform(({ value }) => parseInt(value)) // 将字符串转换为数字
    @IsInt()
    age: number;
    //转布尔值
    @Transform(({ value }) => value === 'true') // 将字符串转换为布尔
    @IsBoolean()
    isActive: boolean;
    //自动加密
    @Transform(({ value }) =>   bcrypt.hashSync(value, 10)) // 将字符串转换为加密后的密码
    @IsString()
    password: string;
}
```
#### 控制返回字段
方法：
- @Exclude() 排除字段
- @Expose() 包含字段
- @Transform() 转换字段
使用：
controller里return new UserRepDto(user); // 返回UserRep对象，控制返回字段
```typescript
// dto/user.rep.dto.ts
import { Expose, Exclude,Transform  } from 'class-transformer';
export class UserRepDto {
    @Expose() // 包含字段
    username: string;

    @Exclude() // 排除字段
    password: string;

    @Transform(({ value }) => value.toUpperCase()) // 转换字段
    @Expose()
    role: string;
}
// user.controller.ts
import { ClassSerializerInterceptor, UseInterceptors } from '@nestjs/common';
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor) // 使用ClassSerializerInterceptor来控制返回字段
export class UserController {
    @Get(':id')
    getUser(@Param('id') id: string) {
        const user = this.userService.findById(id);
        return new UserRep(user); // 返回UserRep对象，控制返回字段
    }
}
```
#### 常见的class-validator装饰器
// 字符串类
@IsString()          是字符串
@IsNotEmpty()        不为空
@Length(min, max)    长度限制
@MinLength(n)        最小长度
@MaxLength(n)        最大长度
@IsEmail()           邮箱格式
@IsUrl()             URL 格式
@IsUUID()            UUID 格式
@Matches(/regex/)    正则匹配
@Contains('str')     包含指定字符串

// 数字类
@IsNumber()          是数字
@IsInt()             是整数
@IsPositive()        正数
@IsNegative()        负数
@Min(n)              最小值
@Max(n)              最大值

// 布尔类
@IsBoolean()         是布尔值

// 数组类
@IsArray()           是数组
@ArrayMinSize(n)     数组最少 n 个元素
@ArrayMaxSize(n)     数组最多 n 个元素
@ArrayNotEmpty()     数组不为空

// 通用
@IsOptional()        可选字段
@IsEnum(Enum)        枚举值
@IsIn([...])         在指定值列表中
@IsNotIn([...])      不在指定值列表中
@ValidateNested()    校验嵌套对象
@IsDate()            日期对象
@IsDateString()      日期字符串（ISO格式）

#### 总结
```
DTO 三大作用：
  ① 定义形状    前端传什么字段，什么类型
  ② 验证数据    不合法自动返回 400，不进入 Controller
  ③ 转换数据    字符串转数字，去除空格，字段过滤

四个变形工具：
  PartialType   → 全部字段变可选   （更新接口）
  PickType      → 只保留某些字段   （登录接口）
  OmitType      → 排除某些字段     （响应 DTO）
  IntersectionType → 合并两个 DTO

使用规范：
  接收数据 → CreateDto / UpdateDto / QueryDto
  返回数据 → ResponseDto（配合 @Exclude @Expose）
  必须用 class，不能用 interface
  全局开启 ValidationPipe whitelist + transform
```

一句话： dto是前后端之间的数据契约，定义了数据的结构、验证规则和转换逻辑，确保数据的正确性和安全性。