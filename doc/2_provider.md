> Provider就是“可以被注入到其他地方的东西”，它可以是一个类、一个值、一个工厂函数等等。通过Provider，我们可以将一些依赖项注入到需要它们的地方，从而实现松耦合和模块化的设计。最常见的就是Service Provider，它通常用于封装业务逻辑和数据访问等功能。通过Service Provider，我们可以将一些公共的功能封装成一个服务类，然后在需要使用这些功能的地方注入这个服务类，从而实现代码的复用和模块化设计。

对比类似 vue的pinia store ，Spring的@Service/@Bean，
使用方式类似，useUserStore(), @Autowired 
管理者为  Pinia   ,      Spring Ioc容器

Provider的本质：IoC - Inversion of Control（控制反转）和 Dependency Injection（依赖注入）的实现机制。通过Provider，我们可以将对象的创建和管理交给框架来处理，而不是在代码中直接创建对象，从而实现了控制反转和依赖注入的设计模式。

```ts
// 传统写法
class Controller{
    service = new Service(); 
}
class Service{
    repo = new UserRepo()
}
class UserRepo{
    db = new Database()
}
//Database构造函数 ，要改所有的new的地方


// NestJS写法 ： 解耦
class Controller{
    constructor(private service: Service){} // 注入service
}

// nest容器负责创建并注入
// 自动完成 new Database() -> new UserRepo() -> new Service() -> new Controller(service)

```


```ts
// user.service.ts
import { Injectable } from '@nestjs/common';
@Injectable() // 这个装饰器让他成为Provider
export class UserService {
    private users  [{id: 1, name: 'user1'}, {id: 2, name: 'user2'}];


    findAll() {
        return this.users;
    }
    findOne(id: string) {
        return this.users.find(user => user.id === +id);
    }
    create(user: {name:string}) {
        const newUser = { id: Date.now(), ...user };
        this.users.push(newUser);
        return newUser;
    }

}

//user.controller.ts
@Controller('users')
export class UserController {
    // 构造函数注入 -nestjs自动把usersService实例注入到controller里
    constructor(private readonly userService: UserService) {}
    @Get()
    findAll() {
        return this.userService.findAll(); // 调用service的方法
    }

    @Post()
    create(@Body() user: {name: string}) {
        return this.userService.create(user);
    }
}


// users.modules.ts
@Module({
    controllers:[UserController],
    providers:[UserService] // 注册service provider
})
export class UserModule {}  
```

### Provider得四种形式
1. Class Provider：通过一个类来定义Provider，NestJS会自动实例化这个类并注入到需要它的地方。
2. Value Provider：通过一个值来定义Provider，NestJS会直接使用这个值作为Provider的实例。
3. Factory Provider：通过一个工厂函数来定义Provider，NestJS会调用这个工厂函数来创建Provider的实例。
4. Existing Provider：通过一个已经存在的Provider来定义新的Provider，NestJS会将新的Provider指向已经存在的Provider，从而实现依赖的重用。

```ts
@Module({
    providers:[
        // Class Provider ，实例化并注入
        UserService,
        // Value Provider ，直接使用这个值作为Provider的实例
        { provide: 'CONFIG', useValue: { port: 3000 } },
        // Factory Provider ，通过工厂函数创建Provider实例
        { provide: 'RANDOM_NUMBER', useFactory: () => Math.random() },
        // Existing Provider ，指向已经存在的Provider，实现依赖重用
        { provide: 'USER_SERVICE_ALIAS', useExisting: UserService }
    ]
})
export class AppModule {}
```
### 声明周期
Provider的生命周期是指Provider实例的创建、使用和销毁的过程。在NestJS中，Provider的生命周期分为以下几个阶段：
1. 创建阶段：当应用程序启动时，NestJS会扫描所有的模块和Provider，并创建Provider的实例。
2. 使用阶段：当需要使用Provider的地方被访问时，NestJS会将Provider的实例注入到需要它的地方，并调用相应的方法。
3. 销毁阶段：当应用程序关闭时，NestJS会销毁所有的Provider实例，释放资源。

一句话： Provider是NestJS中实现依赖注入的核心机制，通过不同的Provider类型和生命周期管理，实现了应用程序的松耦合和模块化设计。