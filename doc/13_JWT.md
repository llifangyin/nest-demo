# JWT 认证

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