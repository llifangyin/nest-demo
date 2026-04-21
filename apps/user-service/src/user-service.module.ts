import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@app/common'
import { CacheModule } from '@nestjs/cache-manager';
import { UserServiceController } from './user-service.controller';
import { UserDao } from './dao/user.dao';
import { UserService } from './user-service.service';
import { SeedService } from './seed.service';

@Module({
  imports:[
    ConfigModule.forRoot({ isGlobal: true }), // 让 ConfigService 在整个应用中都可用
    CacheModule.register({ ttl: 60000 }), // 注册缓存模块，ttl为缓存时间，单位为秒
    // MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])// 将User模型注册到当前模块中，这样就可以在UserDao中使用@InjectModel(User.name)来注入这个模型了。
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UserServiceController],
  providers: [UserService, UserDao, SeedService], //注册UserDao和SeedService到模块的providers数组中，这样NestJS就会知道如何创建和注入它们的实例了。
})
export class UserServiceModule {}
