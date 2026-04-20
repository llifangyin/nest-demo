import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { USER_SERVICE } from '@app/common';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(USER_SERVICE) private readonly userClient: ClientProxy,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: { name: string; password: string }) {
    // 1. 从用户服务查询用户
    const user = await firstValueFrom(
      this.userClient.send({ cmd: 'find_user_by_name' }, { name: body.name }),
    );
    // 2. 在网关做密码验证和 JWT 签发
    return this.authService.login(user, body.password);
  }
}