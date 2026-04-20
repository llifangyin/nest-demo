import {Controller } from '@nestjs/common';
import { UserService } from './user-service.service';
import { UpdateUserDto, CreateUserDto } from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('users')
export class UserServiceController {
  constructor(private readonly userService: UserService) {}

  // @Get()  原来
  // 现在改成了 @MessagePattern，这样这个方法就不再是一个HTTP接口了，而是一个消息处理器，可以通过消息队列来调用它了。
  @MessagePattern({ cmd: 'find_all_users' })
  findAll(@Payload() data: { name?: string; email?: string }) {
    return this.userService.findAll(data.name, data.email);
  }

  @MessagePattern({ cmd: 'find_one_user' })
  findOne(@Payload() data: { id: string }) {
    return this.userService.findOne(data.id);
  }
  // 注意：这个方法给网关登录用，必须返回 password 字段
  // 所以 Service/DAO 里要用 .select('+password') 查询
  @MessagePattern({ cmd: 'find_user_by_name' })
  findByName(@Payload() data: { name: string }) {
    return this.userService.findByName(data.name);
  }

  @MessagePattern({ cmd: 'create_user' })
  create(@Payload() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @MessagePattern({ cmd: 'update_user' })
  update(@Payload() data: { id: string; dto: UpdateUserDto }) {
    return this.userService.update(data.id, data.dto);
  }

  @MessagePattern({ cmd: 'remove_user' })
  remove(@Payload() data: { id: string }) {
    return this.userService.remove(data.id);
  }
}
