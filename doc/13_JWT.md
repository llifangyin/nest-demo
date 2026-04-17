# JWT 认证（JSON WEB TOKEN）

> 类比前端：登录后把 token 存 localStorage，请求时带上 token，后端验证是否有效。

---
## 关键方法
- `jwtService.sign(payload)`：生成 token (service 里用)
- `JwtStrategy.validate(payload)`：验证 token，解析 payload (strategy 里用)


## 一、认证流程

```
1. 用户 POST /auth/login  → 发送 email + password
2. 服务端查到用户 → bcrypt 验证密码
3. 验证通过 → jwtService.sign(payload) 生成 token → 返回前端
4. 前端存 token，后续请求带 Authorization: Bearer <token>
5. JwtAuthGuard 拦截请求 → JwtStrategy 验证 token → 有效则放行
```
---
### 使用流程
1. AuthModule 实现登录逻辑，生成 token
   - import: JwtModule.registerAsync方法配置 JWT_SECRET 和过期时间,
              导入UsersModule 以查询用户
   - providers: AuthService 处理登录逻辑，JwtStrategy 验证 token
   - controllers: AuthController 定义登录接口
   - exports: 导出 AuthService 以供其他模块使用（可选）
    
2. JwtStrategy 验证 token，解析 payload （Passport会在每次请求时自动调用 validate 方法）
    - 继承PassportStrategy(Strategy)，配置从 Authorization header 获取 token 和 JWT_SECRET；
    - validate 方法验证 token，有效则返回用户信息挂到 request.user
3. JwtAuthGuard 保护路由，验证 token 是否有效
  - 继承 AuthGuard('jwt')，使用 JwtStrategy 验证 token，
  - canActivate 方法会在每次请求时自动调用 JwtStrategy.validate 验证 token; Public() 装饰器标记不需要认证的路由
3. UserService 创建用户时，bcrypt 加密密码
  - bcrypt.hash(password, saltRounds) 加密密码，存数据库
4. 配置全局使用保护路由
  - 在 AppModule 里全局使用 JwtAuthGuard， providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }]
  - 或者在需要保护的控制器/路由上使用 @UseGuards(JwtAuthGuard)
5. 测试登录和访问受保护的路由
  - 自定义装饰   @Public() 标记不需要认证的路由


## 二、安装依赖

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs
npm install -D @types/passport-jwt @types/bcryptjs
```

---

## 三、目录结构

```
src/auth/
├── auth.module.ts
├── auth.controller.ts   ← POST /auth/login
├── auth.service.ts      ← 验证密码、生成 token
├── jwt.strategy.ts      ← 验证 token、解析 payload
├── jwt-auth.guard.ts    ← 路由守卫
└── dto/login.dto.ts
```

---

## 四、.env 加 JWT 配置

```dotenv
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d
```

---

## 五、实现

### login.dto.ts
```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';
export class LoginDto {
  @IsEmail()
  email: string;
  @IsNotEmpty()
  password: string;
}
```

### auth.service.ts
```typescript
@Injectable()
export class AuthService {
  constructor(
    private readonly userDao: UserDao,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userDao.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('邮箱或密码错误');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw new UnauthorizedException('邮箱或密码错误');

    // payload 存入 token，不要放密码
    const payload = { sub: user._id, email: user.email, name: user.name };
    return { access_token: this.jwtService.sign(payload) };
  }
}
```

### jwt.strategy.ts（验证 token）
```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }
  // token 验证通过后，返回值挂到 request.user
  validate(payload: { sub: string; email: string; name: string }) {
    return { id: payload.sub, email: payload.email, name: payload.name };
  }
}
```

### jwt-auth.guard.ts
```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### auth.module.ts
```typescript
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

### UsersModule 需要导出 UserDao
```typescript
@Module({
  exports: [UserDao],  // ← AuthService 需要用到
})
export class UsersModule {}
```

### 密码加密（在 UsersService.create 里）
```typescript
import * as bcrypt from 'bcryptjs';

async create(dto: CreateUserDto) {
  const exist = await this.userDao.exists({ email: dto.email });
  if (exist) throw new ConflictException('邮箱已存在');
  const hashedPassword = await bcrypt.hash(dto.password, 10);
  return this.userDao.create({ ...dto, password: hashedPassword });
}
```

---

## 六、使用 Guard 保护路由

```typescript
@UseGuards(JwtAuthGuard)
@Get()
findAll() { ... }

// 获取当前登录用户（request.user = JwtStrategy.validate 的返回值）
@UseGuards(JwtAuthGuard)
@Get('me')
getMe(@Request() req) {
  return req.user;  // { id, email, name }
}
```

---

## 七、测试

```bash
# 1. 注册
POST /users  { "name": "zanyu", "email": "zanyu@test.com", "password": "123456" }

# 2. 登录
POST /auth/login  { "email": "zanyu@test.com", "password": "123456" }
# 返回: { "access_token": "eyJhbGci..." }

# 3. 带 token 访问
GET /users
Headers: Authorization: Bearer eyJhbGci...
```

---

## 八、JWT 结构说明

```
eyJhbGciOiJIUzI1NiJ9          ← Header（算法）
.eyJzdWIiOiIxMjMiLCJlbWFpbCI6InRlc3QifQ   ← Payload（Base64，可解码！）
.xxxxx                          ← Signature（防篡改签名）
```

Payload 是 Base64 编码不是加密，**不要存密码等敏感信息**，只存 id、邮箱等。