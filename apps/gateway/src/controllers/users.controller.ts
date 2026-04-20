import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { USER_SERVICE, CreateUserDto, UpdateUserDto } from '@app/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(@Inject(USER_SERVICE) private readonly userClient: ClientProxy) {}

  @Get()
  async findAll(@Query('name') name?: string, @Query('email') email?: string) {
    // send() 返回 Observable，用 firstValueFrom 转成 Promise
    return firstValueFrom(
      this.userClient.send({ cmd: 'find_all_users' }, { name, email }),
    );
  }

  @Get('me')
  getMe(
    @Request() req: { user: { userId: string; email: string; name: string } },
  ) {
    return req.user;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'find_one_user' }, { id }),
    );
  }

  @Public()
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return firstValueFrom(this.userClient.send({ cmd: 'create_user' }, dto));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return firstValueFrom(
      this.userClient.send({ cmd: 'update_user' }, { id, dto }),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return firstValueFrom(this.userClient.send({ cmd: 'remove_user' }, { id }));
  }
}
