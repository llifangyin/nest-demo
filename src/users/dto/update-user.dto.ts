import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
// 使用PartialType的目的是为了让UpdateUserDto继承CreateUserDto的属性，并将它们变为可选的，这样在更新用户信息时就不需要提供所有的字段了。
export class UpdateUserDto extends PartialType(CreateUserDto) {}
