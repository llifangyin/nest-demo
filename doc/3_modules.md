> Module是nestjs的组织单元，把相关的组件（providers, controllers, services）组织在一起。
每个应用至少有一个模块，称为根模块（Root Module）。
模块通过装饰器`@Module()`定义，接受一个对象参数，其中包含以下属性：
- `imports`: 导入其他模块。
- `controllers`: 定义模块的控制器。
- `providers`: 定义模块的提供者（服务）。
- `exports`: 导出模块的提供者，使其在其他模块中可用。

### 功能模块的标准结构
src/
└── users/
    ├── users.module.ts       ← 模块定义
    ├── users.controller.ts   ← 路由控制
    ├── users.service.ts      ← 业务逻辑
    ├── dto/
    │   ├── create-user.dto.ts
    │   └── update-user.dto.ts
    └── entities/             // 数据库实体
        └── user.entity.ts



### 全局模块 @Global()
全局模块通过装饰器`@Global()`定义，表示该模块中的提供者在整个应用中都是可用的，无需导入即可使用。
```typescript
// global.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class GlobalModule {}

// app.module.ts
import { Module } from '@nestjs/common';
import { GlobalModule } from './global.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
@Module({
  imports: [GlobalModule], // 导入全局模块
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

//其他的Service无需要导入GlobalModule就可以直接使用ConfigService
import { Injectable } from '@nestjs/common';
import { ConfigService } from './config.service';

@Injectable()
export class SomeService {
  constructor(private configService: ConfigService) {}
}
```
在上面的例子中，`ConfigService`被定义在`GlobalModule`中，并通过`@Global()`装饰器使其在整个应用中可用。这样，在其他模块中无需导入`GlobalModule`即可使用`ConfigService`。

### 动态模块
有时模块需要接收参数才能初始化，比如数据库连接需要传入配置：
```typescript
//dynamic.module.ts
import { DynamicModule, Module } from '@nestjs/common';
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule { // forRoot是一个静态方法，接受配置选项并返回一个DynamicModule对象
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }
}

// app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
@Module({
  imports: [
    DatabaseModule.forRoot({
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'password',
        database: 'mydb',
      }),
    ],
})
export class AppModule {}

```


#### 完整项目的模块结构
```
AppModule（根）
├── ConfigModule（全局）      → 配置管理
├── DatabaseModule（全局）    → 数据库连接
│
├── UsersModule              → 用户功能
│   ├── UsersController
│   ├── UsersService
│   └── imports: [DatabaseModule, EmailModule]
│
├── OrdersModule             → 订单功能
│   ├── OrdersController
│   ├── OrdersService
│   └── imports: [UsersModule, DatabaseModule]
│
├── AuthModule               → 认证功能
│   ├── AuthController
│   ├── AuthService
│   └── imports: [UsersModule, JwtModule]
│
└── EmailModule              → 邮件功能（被多个模块共享）
    └── EmailService


```
一句话： Module 就是 NestJS 的"功能边界"。
每个功能（用户、订单、认证）都是一个模块，模块内部的东西默认私有，只有显式 exports 的才能被外部使用。
这和 ES Module 的 export / import 思想完全一致——你不暴露的，别人就用不了