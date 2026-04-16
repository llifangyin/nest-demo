# Redis 缓存

> 类比前端：Redis 就像后端的 sessionStorage，读写极快，支持自动过期。

---

## 一、为什么需要 Redis

```
不用缓存：  每次请求 → 查 MongoDB（磁盘 IO，~10ms）
用 Redis：  第一次 → 查 MongoDB → 存入 Redis
            后续请求 → 直接读 Redis（内存，~0.1ms）→ 快 100 倍
```

常见场景：
- 缓存用户信息（避免每次请求都查数据库验证 token）
- 缓存热门列表接口
- 存储 JWT 黑名单（用户登出后让 token 失效）
- 限流计数器

---

## 二、Docker 启动 Redis

```powershell
docker run -d -p 6379:6379 --name nest-redis redis:7

# 常用命令
docker start nest-redis
docker stop nest-redis
docker logs nest-redis
```

推荐安装可视化工具：**Another Redis Desktop Manager**（免费），连接 `localhost:6379`。

---

## 三、安装依赖

```bash
npm install @nestjs/cache-manager cache-manager ioredis
```

| 包 | 作用 |
|---|---|
| `@nestjs/cache-manager` | NestJS 缓存模块封装 |
| `cache-manager` | 缓存抽象层，支持多种存储后端 |
| `ioredis` | Redis 客户端，性能好、支持集群 |

---

## 四、.env 加 Redis 配置

```dotenv
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 五、接入步骤

### 1. AppModule 注册 CacheModule

```typescript
// app.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import { createClient } from 'redis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.registerAsync({
      isGlobal: true,  // 全局可用，不需要每个模块单独 import
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const store = await import('cache-manager-ioredis-yet')
          .then(m => m.redisStore({
            host: config.get('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
          }));
        return { store, ttl: 60 * 1000 };  // 默认缓存 60 秒
      },
    }),
    // ...其他模块
  ],
})
export class AppModule {}
```

> 需要额外安装：`npm install cache-manager-ioredis-yet`

### 2. 在 Service 中手动读写缓存

```typescript
// users/user.service.ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(
    private readonly userDao: UserDao,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async findAll(name?: string, email?: string) {
    const cacheKey = `users:list:${name || ''}:${email || ''}`;

    // 1. 先查缓存
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // 2. 缓存没有，查数据库
    const data = await this.userDao.findAll({ name, email });

    // 3. 存入缓存，60 秒过期
    await this.cacheManager.set(cacheKey, data, 60000);
    return data;
  }

  async remove(id: string) {
    await this.findOne(id);
    const result = await this.userDao.deleteById(id);
    // 删除用户后清除列表缓存（避免缓存脏数据）
    await this.cacheManager.del(`users:list::`)
    return result;
  }
}
```

### 3. 自动缓存 GET 接口（简单方式）

Controller 上加 `@UseInterceptors(CacheInterceptor)`，GET 请求结果自动缓存：

```typescript
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('users')
@UseInterceptors(CacheInterceptor)  // 所有 GET 请求自动缓存
export class UsersController {
  @Get()
  findAll() { ... }  // 第一次查数据库，后续从缓存返回
}
```

---

## 六、常用 API

```typescript
// 存值（ttl 单位毫秒）
await cacheManager.set('key', value, 60000);  // 60秒

// 取值（不存在返回 undefined）
const val = await cacheManager.get('key');

// 删除
await cacheManager.del('key');

// 清空所有缓存
await cacheManager.reset();
```

---

## 七、缓存 key 设计原则

```typescript
// 好的 key 命名：模块:类型:唯一标识
'users:list'           // 用户列表
'users:detail:123'     // id=123 的用户详情
'auth:token:xxx'       // token 对应的用户信息

// 避免 key 冲突和缓存穿透
```

---

## 八、与 JWT 结合：缓存用户信息

Guard 每次验证 token 后都要查数据库拿用户信息，可以用 Redis 缓存：

```typescript
// jwt.strategy.ts
async validate(payload: { sub: string; email: string }) {
  const cacheKey = `auth:user:${payload.sub}`;

  // 先查缓存
  let user = await this.cacheManager.get(cacheKey);
  if (!user) {
    user = await this.userDao.findById(payload.sub);
    // 缓存 5 分钟
    await this.cacheManager.set(cacheKey, user, 5 * 60 * 1000);
  }
  return user;
}
```

用户每次请求不再查 MongoDB，直接从 Redis 读取，性能大幅提升。