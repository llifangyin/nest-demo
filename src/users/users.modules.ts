import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './user.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UserDao } from './dao/user.dao';

@Module({
  imports:[
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])// 将User模型注册到当前模块中，这样就可以在UserDao中使用@InjectModel(User.name)来注入这个模型了。
  ],
  controllers: [UsersController],
  providers: [UsersService, UserDao], //注册UserDao到模块的providers数组中，这样NestJS就会知道如何创建和注入UserDao实例了。
})
export class UsersModule {}
