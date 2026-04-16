import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    // super() 里配置 JWT 的提取方式和密钥，Passport 会在每次请求时自动调用 validate 方法来验证 token。
    // jwtFromRequest 配置了从请求头的 Authorization 字段提取 token，要求 token 以 Bearer 开头。
    // secretOrKey 配置了用于验证 token 的密钥，这个密钥应该与我们在 AuthModule 中配置的 JWT_SECRET 保持一致。
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: { sub: string; email: string; name: string }) {
    // validate 方法会在每次请求时被调用，用于验证 token 的有效性。
    // payload 是我们在生成 token 时传入的用户信息对象。
    // 如果验证通过，我们可以返回一个包含用户信息的对象，这个对象会被附加到请求对象上，供后续的请求处理使用。
    return { userId: payload.sub, email: payload.email, name: payload.name };
  }
}
