import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from '../../../../libs/common/src/dto/create-user.dto';
import { UpdateUserDto } from '../../../../libs/common/src/dto/update-user.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query('name') name?: string, @Query('email') email?: string) {
    return this.usersService.findAll(name, email);
  }

  // 获取当前登录用户信息（来自 JwtStrategy.validate 返回值）
  @Get('me')
  getMe(
    @Request() req: { user: { userId: string; email: string; name: string } },
  ) {
    return req.user;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // 注册接口不需要 token
  @Public()
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
