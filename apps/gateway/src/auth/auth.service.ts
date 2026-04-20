import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(user: any, password: string) {
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('密码错误');
    }
    const payload = { sub: user._id, email: user.email, name: user.name };
    return { access_token: this.jwtService.sign(payload) };
  }
}
