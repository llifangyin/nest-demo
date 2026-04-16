# MongoDB + Mongoose 使用指南

> 从前端视角理解：MongoDB 就像一个"存 JSON 的数据库"，Mongoose 就像"操作这个数据库的 API 层"。

---

## 一、MongoDB vs MySQL 核心区别

| | MySQL（关系型） | MongoDB（文档型） |
|---|---|---|
| 存储单元 | 行（Row） | 文档（Document，就是 JSON 对象） |
| 表 | Table | Collection（集合） |
| 数据库 | Database | Database |
| 主键 | `id INT AUTO_INCREMENT` | `_id` ObjectId（自动生成） |
| 建表 | 必须先 CREATE TABLE | 第一次插入数据时自动创建 |
| 查询语言 | SQL | MongoDB 查询语法（JSON 风格） |
| 关联 | JOIN | populate（引用） 或 嵌套文档 |

MongoDB 存的数据长这样（跟 JSON 几乎一样）：
```json
{
  "_id": "6623a1f2b4e2c3d1e8f90001",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2024-04-16T10:00:00Z"
}
```

---

## 二、本地启动（Docker）

```powershell
# 启动 MongoDB 容器
docker run -d -p 27017:27017 --name nest-mongo mongo:7

# 常用管理命令
docker start nest-mongo      # 启动
docker stop nest-mongo       # 停止
docker ps                    # 查看运行状态
docker logs nest-mongo       # 查看日志
```

> **不需要手动建库建表**，NestJS 启动连接后，第一次写入数据时 MongoDB 会自动创建 `nest-demo` 数据库和 `users` 集合。

推荐安装可视化工具：[MongoDB Compass](https://www.mongodb.com/try/download/compass)（免费），连接 `mongodb://localhost:27017` 可以直观看到数据。

---

## 三、NestJS 中接入 Mongoose

### 1. 安装依赖
```bash
npm install @nestjs/mongoose mongoose
```

### 2. AppModule 连接数据库
```typescript
// app.module.ts
@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/nest-demo'),
    // nest-demo 是数据库名，不存在会自动创建
  ],
})
export class AppModule {}
```

### 3. 定义 Schema（相当于表结构）
```typescript
// users/schemas/user.schema.ts
@Schema({ timestamps: true })  // 自动维护 createdAt / updatedAt
export class User {
  // _id 由 MongoDB 自动生成，不需要手动定义

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })  // unique: 唯一索引
  email: string;

  @Prop({ required: true })
  password: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

### 4. Module 中注册 Schema
```typescript
// users/users.module.ts
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
      // forFeature 把 Schema 注册为可注入的 Model
      // 之后就可以用 @InjectModel(User.name) 注入了
    ]),
  ],
  providers: [UsersService, UserDao],
  controllers: [UsersController],
})
export class UsersModule {}
```

---

## 四、Mongoose 常用查询（本项目 UserDao 对照）

本项目的 `user.dao.ts` 封装了所有数据库操作，以下是每个方法的含义：

```typescript
// 查所有（支持模糊过滤，不返回 password 字段）
this.userModel.find(query).select('-password').exec()
// 等价 SQL: SELECT id,name,email,createdAt FROM users WHERE ...

// 按 _id 查单个
this.userModel.findById(id).exec()
// 等价 SQL: SELECT * FROM users WHERE id = ?

// 按条件查单个
this.userModel.findOne({ email }).exec()
// 等价 SQL: SELECT * FROM users WHERE email = ?

// 创建
this.userModel.create(user)
// 等价 SQL: INSERT INTO users (name, email, password) VALUES (...)

// 按 _id 更新，{ new: true } 表示返回更新后的数据
this.userModel.findByIdAndUpdate(id, user, { new: true }).exec()
// 等价 SQL: UPDATE users SET ... WHERE id = ?

// 按 _id 删除
this.userModel.findByIdAndDelete(id).exec()
// 等价 SQL: DELETE FROM users WHERE id = ?

// 判断是否存在
this.userModel.exists({ email })
// 等价 SQL: SELECT 1 FROM users WHERE email = ? LIMIT 1
```

---

## 五、查询条件语法（重点）

Mongoose 的查询条件是 JSON 对象，常用操作符：

```typescript
// 精确匹配
{ name: 'Alice' }                               // WHERE name = 'Alice'

// 模糊搜索（正则），i = 忽略大小写
{ name: /alice/i }
{ name: new RegExp(keyword, 'i') }              // 动态关键词

// 比较
{ age: { $gt: 18 } }                            // age > 18
{ age: { $gte: 18 } }                           // age >= 18
{ age: { $lt: 60 } }                            // age < 60
{ age: { $in: [18, 20, 25] } }                  // age IN (18,20,25)

// 多条件 AND（默认）
{ name: 'Alice', email: 'alice@x.com' }

// 多条件 OR
{ $or: [{ name: 'Alice' }, { name: 'Bob' }] }
```

---

## 六、链式调用（排序、分页、字段过滤）

```typescript
this.userModel
  .find({ name: /alice/i })   // 过滤条件
  .select('-password')         // 排除 password 字段（加 - 表示排除）
  .sort({ createdAt: -1 })     // 按创建时间倒序（-1降序，1升序）
  .skip(0)                     // 跳过前 N 条（分页用）
  .limit(10)                   // 最多返回 10 条
  .exec()                      // 执行并返回 Promise
```

实现分页：
```typescript
const page = 1
const pageSize = 10

this.userModel
  .find()
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .exec()
```

---

## 七、关于 `_id` 和 `id`

MongoDB 自动生成的主键叫 `_id`，类型是 ObjectId，看起来像字符串：
```
6623a1f2b4e2c3d1e8f90001
```

Mongoose 会同时提供 `_id`（ObjectId 类型）和 `id`（字符串，是 `_id` 的字符串版本），用 `id` 更方便。

**和之前内存数组版本的区别**：
- 之前：`id` 是 `number`（1, 2, 3...）
- 接入 MongoDB 后：`id` 是 `string`（`"6623a1f2b4e2c3d1e8f90001"`）

所以 Controller 里要去掉 `ParseIntPipe`：
```typescript
// 之前（内存数组）
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) { ... }

// 现在（MongoDB）
@Get(':id')
findOne(@Param('id') id: string) { ... }
```

---

## 八、Mongoose 中间件（了解）

可以在数据库操作前后执行逻辑，常见用途是**保存前加密密码**：

```typescript
// user.schema.ts 末尾加上
import * as bcrypt from 'bcrypt';

UserSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
  next()
})
```

这样调用 `create()` 时密码会自动加密，不需要在 Service 层手动处理。

---

## 九、本项目完整数据流

```
HTTP 请求
  → UsersController（路由 + 参数解析）
    → UsersService（业务逻辑：校验邮箱重复、检查用户是否存在）
      → UserDao（数据库操作：封装 Mongoose 调用）
        → MongoDB（实际存储）
```

每层职责清晰：
- 修改数据库操作 → 只改 **UserDao**
- 修改业务规则   → 只改 **UsersService**
- 修改路由参数   → 只改 **UsersController**
