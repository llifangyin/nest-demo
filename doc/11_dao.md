> dao(Data Access Object)，数据访问对象，专门负责与数据库交互，把sql或数据库操作封装起来，让service不关心数据库查询。

流程： Http请求 -> Controller -> Service -> Dao -> Database

```ts
//service
@Injectable()
export class UserService {
    constructor(private readonly userDao: UserDao) {}
    async findAll() {
        return this.userDao.findAll();
    }
}

//dao
@Injectable()
export class UserDao {
    async findAll() {
        // 这里可以使用任何数据库库，比如TypeORM、Prisma、Mongoose等
        return  db.query('SELECT * FROM users');
    }
}
```

#### Dao的叫法
在 NestJS 里，DAO 这个概念随着 ORM 的使用方式不同，有几种叫法： 
ORM(Object-Relational Mapping) 是一种将数据库表映射为对象的技术，不同的 ORM 库有不同的实现方式，但本质上都是封装数据库操作，提供给 Service 使用。
```
原始概念      NestJS 实际叫法 
──────────    ──────────────────────────────
DAO           Repository（TypeORM） // TypeORM 是 NestJS 官方推荐的 ORM 库，Repository 是 TypeORM 中负责数据访问的类
              PrismaService（Prisma） // Prisma 是一个现代的 ORM 库，PrismaService 是 NestJS 中封装 Prisma 的服务类，负责数据访问
              Model（Mongoose） // Mongoose 是一个 MongoDB 的 ODM 库，Model 是 Mongoose 中负责数据访问的类

本质是同一个东西：
封装数据库操作，给 Service 提供干净的数据访问接口

```
#### Mongoose 的核心概念先理解
```
TypeORM 概念          Mongoose 对应
────────────────      ────────────────
Entity（实体类）   →   Schema（模式）
Repository         →   Model（模型）
@InjectRepository  →   @InjectModel
```

#### 第一步：定义Schema(对应数据库表结构)
- @Schema 装饰器定义一个类，这个类就是我们数据库中的表结构，
- @Prop 装饰器定义表中的字段，
- SchemaFactory.createForClass() 方法根据这个类创建
```typescript
//schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose'; // Document是Mongoose中表示一个文档的类型
export type UserDocument = User & Document; // 定义UserDocument类型，包含User的属性和Document的属性
@Schema() // @Schema装饰器标记这是一个Mongoose的Schema
export class User {
    @Prop({ required: true }) // @Prop装饰器标记这是一个属性，Mongoose会根据这个属性生成对应的字段
    name: string;
    @Prop({ required: true })
    email: string;
    @Prop({ required: true })
    password: string;
}

export const UserSchema = SchemaFactory.createForClass(User); // 根据User类创建一个Mongoose的Schema
```
#### 第二步：注册到Module
使用**MongooseModule.forFeature**()方法将Schema注册为Model，这样就可以在Service中注入Model来进行数据库操作了。
```typescript
//users.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UserService } from './user.service';
import { UserController } from './user.controller';
@Module({
    imports: [
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), // 注册User模型
    ],
    providers: [UserService],
    controllers: [UserController],
})
export class UsersModule {}
```
跟模块连接数据库
使用**MongooseModule.forRoot**()方法连接MongoDB数据库，通常在AppModule中进行配置。
```typescript
//app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
@Module({
    imports: [
        MongooseModule.forRoot('mongodb://localhost/nest-demo'), // 连接MongoDB数据库
        UsersModule,
    ],
})
export class AppModule {}
```
#### 第三步：自定义Repository(DAO)

把数据库操作封装到这里
InjectModel装饰器注入Model，Model就是我们之前注册的User模型，可以直接使用它来进行数据库操作。
调用: userModel.find().exec() ,exec()方法会执行查询并返回一个Promise，这样我们就可以在Service中使用async/await来处理数据库操作了。
```typescript
//user.repository.ts 或者 user.dao.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
@Injectable()
export class UserRepository {
    constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}
    async findAll(): Promise<User[]> {
        return this.userModel.find().exec(); // 使用Mongoose的find方法查询所有用户
    }
    async findOne(id: string): Promise<User> {
        return this.userModel.findById(id).exec();
    }
}
```
#### 第四步：在Service中使用Repository
```typescript
//user.service.ts
import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
@Injectable()
export class UserService {
    constructor(private readonly userRepository: UserRepository) {}
    async findAll() {
        return this.userRepository.findAll();
    }
    async findOne(id: string) {
        return this.userRepository.findOne(id);
    }
}
```

#### 嵌套文档（Mongoose的特殊功能）
Mongoose支持在一个Schema中嵌套另一个Schema，这样就可以在一个文档中包含另一个文档的结构，非常适合表示一对多或多对多的关系。
@Schema 装饰器定义一个嵌套的Schema，@Prop装饰器使用type属性指定这个字段的类型为另一个Schema。
```typescript
//schemas/user.schema.ts
class Address {
    @Prop()
    street: string;
    @Prop()
    city: string;
    @Prop()
    country: string;
}
@Schema({timestamps: true}) // timestamps选项会自动添加createdAt和updatedAt字段

export class User {
    @Prop({ required: true })
    name: string;
    @Prop({ required: true })
    email: string;
    @Prop({ required: true })
    password: string;

    @Prop({ type: Address }) // 嵌套Address Schema
    address: Address;
}
```
#### 关联查询
Mongoose 用 populate 做关联查询，类似 SQL 的 JOIN：
```typescript
//schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
@Schema({timestamps: true})
export class Order {
    @Prop({ required: true })
    product: string;
    @Prop({ required: true })
    quantity: number;

    @Prop({ type:Types.ObjectId, ref: 'User' }) // 关联User模型
    user: User;
}
// 在Service中使用populate查询订单时自动填充用户信息
@Injectable()
export class OrderRepository {
    constructor(
        @InjectModel(Order.name) 
        private orderModel: Model<OrderDocument>
    ) {}
    findWithUser(orderId: string) {
        return this.orderModel
        .findById(orderId)
        .populate('userId', 'name email')
        .exec(); // populate('user')会自动查询关联的User文档并填充到结果中
    }
    findByUserId(userId: string) {
        return this.orderModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .exec(); // 根据用户ID查询订单，并填充用户信息
    }
}
```

#### 完整的目录结构
```
src/
└── users/
    ├── schemas/
    │   └── user.schema.ts          ← Schema 定义（表结构）
    ├── repositories/
    │   └── user.repository.ts      ← DAO（数据库操作）
    ├── dto/
    │   ├── create-user.dto.ts
    │   ├── update-user.dto.ts
    │   └── query-user.dto.ts
    ├── users.service.ts            ← 业务逻辑
    ├── users.controller.ts         ← 路由处理
    └── users.module.ts             ← 模块注册
```
#### 总结
```
Mongoose DAO 三个核心：

① Schema    →  定义数据结构（相当于数据库表）
   @Schema / @Prop

② Model     →  操作数据库的工具（相当于 Repository）
   @InjectModel(User.name)
   private userModel: Model<UserDocument>

③ Repository →  封装 Model 操作，给 Service 提供语义化方法
   findByEmail()  findWithPagination()  incrementLoginCount()


常用 Mongoose 操作符：
   $set    →  更新指定字段
   $inc    →  数字字段自增/自减
   $push   →  向数组追加元素
   $pull   →  从数组移除元素
   $or     →  或条件查询
   $regex  →  正则匹配（模糊搜索）

三层职责：
   Schema      →  数据长什么样
   Repository  →  数据怎么存取
   Service     →  业务规则是什么
```