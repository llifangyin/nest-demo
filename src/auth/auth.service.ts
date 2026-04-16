import { Injectable } from '@nestjs/common';
import { UserDao } from '../users/dao/user.dao';
import { UserDocument } from '../users/schemas/user.schema';
//引入JWtService
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly userDao: UserDao,
    private readonly jwtService: JwtService,
  ) {}
  async login(dto: LoginDto) {
    const user = (await this.userDao.findByEmail(
      dto.email,
    )) as UserDocument | null;
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // bcrypt.compare 方法会将用户输入的密码（dto.password）与数据库中存储的哈希密码（user.password）进行比较。
    // 如果匹配成功，isMatch 将为 true，否则为 false。
    // 如果密码不匹配，我们就抛出一个 UnauthorizedException 异常，提示用户邮箱或密码无效。   
    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { email: user.email, name: user.name, sub: user._id };
    // jwtService.sign 方法会根据我们在AuthModule中配置的JWT选项来生成一个JWT令牌，其中payload是我们传入的用户信息对象，access_token是生成的JWT令牌字符串。这个令牌可以在客户端存储，并在后续的请求中作为Authorization头的一部分发送给服务器，以便服务器验证用户身份和权限。
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
