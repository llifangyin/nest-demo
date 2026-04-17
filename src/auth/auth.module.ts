import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from 'src/users/users.modules';

@Module({
  imports: [
    PassportModule, 
    //  JwtModule.registerAsync 方法允许我们异步配置 JWT 模块，这样我们就可以从 ConfigService 中获取 JWT_SECRET 和过期时间等配置项了。
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: { 
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d') as `${number}${'s'|'m'|'h'|'d'|'w'|'y'}` 
        },
      }),
    }),
    UsersModule,// 引入 UsersModule，这样我们就可以在 AuthService 中注入 UserDao 来查询用户了。
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
