> custom decorators 就是把重复的参数或元数据标记封装成一个专属装饰器，让代码更简洁易读。比如我们可以创建一个@Public装饰器来标记公开路由，这样在Guard中就可以直接检查这个装饰器，而不需要每次都写重复的逻辑。

#### 内置装饰器
- @Req() 获取原生请求对象 , 问题：拿到整个request，还要手动获取字段
- @Headers() 获取请求头参数 , 问题：每次都要写@Headers('authorization')，很麻烦
- @Roles('admin') 角色装饰器，配合Guard使用，问题: 需要自己封装SetMetadata来存储角色信息，比较麻烦
- @UseGuards() 绑定Guard，问题：每次都要写@UseGuards(JwtAuthGuard, RolesGuard)，很麻烦

自定义装饰器解决： **把重复代码封装一次，复用**
方法： 
- createParamDecorator（参数装饰器）
- SetMetadata（元数据装饰器）
- applyDecorators（组合装饰器）
#### 1. 参数装饰器
##### 从request中提取字段：
```ts
// decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (field: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return field ? request.user?.[field] : request.user; // 从request对象中提取user字段，返回给控制器方法
  },
);

// controllers/user.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator';
@Controller('users')
export class UserController {
  @Get('profile')
  getProfile(
        @CurrentUser() user,
        @CurrentUser('name') userName, // 直接获取user.name字段
        @CurrentUser('email') userEmail, // 直接获取user.email字段
    ) { // 使用@CurrentUser装饰器，直接获取当前用户信息
    return user;
  }
}
```

##### 获取客户端IP地址：
```ts
export const RealIp = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-forwarded-for'] || request.connection.remoteAddress; // 获取客户端IP地址
  },
);
```
##### 获取token
```ts
export const AuthToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || '';
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null; // 获取Authorization头中的Bearer token
  },
);
```
##### 获取分页参数
```ts
export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const page = parseInt(request.query.page, 10) || 1;
    const limit = parseInt(request.query.limit, 10) || 10;
    return { page, limit }; // 获取分页查询参数
  },
);
```

##### 使用以上自定义装饰器：
```ts
@Get()
findAll(
  @CurrentUser() user:User, // 获取当前用户信息
  @CurrentUser('name') userName: string, // 获取当前用户的name字段
  @RealIp() ip:string, // 获取客户端IP地址
  @Pagination() pagination:{ page: number, limit: number }, // 获取分页参数
  @AuthToken() token: string, // 获取认证token
) {
  console.log('Pagination:', pagination);
  console.log('Auth Token:', token);
  return this.itemsService.findAll(pagination);
}
```

### 2. 元数据装饰器 （配合Guard使用）
```ts
// decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
@SetMetadata(IS_PUBLIC_KEY, true) // 定义一个@Public装饰器，设置isPublic元数据为true
@SetMetadata('role', ['admin', 'editor']) // 定义一个@Admin装饰器，设置role元数据为admin
export const Admin = () => SetMetadata('role', ['admin', 'editor']);
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// guards/auth.guard.ts

@Roles('admin', 'editor') // 在Guard中读取@Admin装饰器设置的role元数据，进行权限检查

//controllers/user.controller.ts.
@Controller('users')
export class UserController {
    @Get('public')
    @Public() // 标记这个路由处理器为公开的，不需要认证
    getPublicData() {
        return { message: 'This is public data' };
    }
    
    @Get('admin')
    @Admin() // 标记这个路由处理器需要admin角色才能访问
    getAdminData() {
        return { message: 'This is admin data' };
    }
}
```
### 3. 组合装饰器
```ts
// decorators/auth.decorator.ts // 定义一个组合装饰器，包含@UseGuards和@SetMetadata
import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
export function Auth(...roles: string[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard), // 组合使用JwtAuthGuard和RolesGuard
    SetMetadata('roles', roles), // 设置角色元数据
  );
}
// controllers/user.controller.ts
@Controller('users')
export class UserController {
    @Get('profile')
    @Auth('user', 'admin') // 使用组合装饰器，指定需要user或admin角色才能访问
    getProfile() {
        return { id: 1, name: 'John', roles: ['user'] };
    }
}
```

### 4. 配合Pipe参数处理
```ts
//current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (field: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return  field ? request.user?.[field] : request.user; // 获取当前用户信息，交给管道处理
  },
);

// controllers/user.controller.ts
@Controller('users')
export class UserController {
   @Get('profile')
   getProfile(@CurrentUser(new ValidationPipe()) userName: string) { // 获取当前用户
    return { name: userName };
   }
}
```

### 实际项目的装饰器组织
```
src/
└── common/
    └── decorators/
        ├── current-user.decorator.ts   // 获取当前用户
        ├── public.decorator.ts         // 标记公开路由
        ├── roles.decorator.ts          // 角色标记
        ├── auth.decorator.ts           // 组合：Guard + Roles
        ├── pagination.decorator.ts     // 分页参数
        └── index.ts                    // 统一导出
```


### 总结
```
三种自定义装饰器：

① 参数装饰器 createParamDecorator
   从 request 提取数据，替代 @Req() 手动取值
   @CurrentUser()  @RealIp()  @Pagination()

② 元数据装饰器 SetMetadata 封装
   给路由打标签，配合 Guard 里的 Reflector 读取
   @Roles('admin')  @Public()  @ApiVersion('v2')

③ 组合装饰器 applyDecorators
   把多个装饰器合并，减少重复代码
   @Auth('admin') = @UseGuards(...) + @SetMetadata(...) + ...


选择原则：
  重复取 request 字段      → 参数装饰器
  重复打元数据标签          → 元数据装饰器
  重复组合多个装饰器        → 组合装饰器
```
一句话： 自定义装饰器让代码更简洁，逻辑更清晰，维护更方便，是 NestJS 中非常实用的功能。