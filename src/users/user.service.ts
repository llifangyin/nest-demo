import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDao } from './dao/user.dao';
import * as bcrypt from 'bcryptjs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';

export interface User {
  id?: string;
  name: string;
  email: string;
  password: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly userDao: UserDao,
    @Inject(CACHE_MANAGER) private cacheManager: Cache) {} 
  // private users: User[] = [
  //   {
  //     id: 0,
  //     name: 'John Doe',
  //     email: 'john.doe@example.com',
  //     password: 'password',
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //   },
  //   {
  //     id: 1,
  //     name: 'Jane Smith',
  //     email: 'jane.smith@example.com',
  //     password: 'password',
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //   },
  // ];
  // private nextId = 1;

  async findAll(name?: string, email?: string): Promise<User[]> {
    // v1 - 内存数据
    // let list = this.users.map(({ password, ...u }) => u);
    // if (name) {
    //   list = list.filter((u) => u.name.includes(name));
    // }
    // if (email) {
    //   list = list.filter((u) => u.email.includes(email));
    // }
    // return list;
    // v2 - 数据库查询
    // return this.userDao.findAll({ name, email });
    // v3 - 先查缓存，缓存没有再查数据库
    const cacheKey = `users:${name || ''}:${email || ''}`;
    const cached = await this.cacheManager.get<User[]>(cacheKey);
    if(cached) {
      return cached;
    }

    const data = await this.userDao.findAll({ name, email });
    await this.cacheManager.set(cacheKey, data, 60000); // 缓存1分钟
    return data;

  }

  async findOne(id: string): Promise<User> {
    // const user = this.users.find((user) => user.id === id);
    // if (!user) {
    //   throw new NotFoundException(`User with id ${id} not found`);
    // }
    // return user;
    const user = await this.userDao.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto) {
    // const user: User = { id: this.nextId++, createdAt: new Date(), updatedAt: new Date(), ...dto };
    // this.users.push(user);
    // const { password, ...result } = user;
    // return result;
    const exist = await this.userDao.exists({ email: dto.email });
    if (exist) {
      throw new ConflictException(
        `User with email ${dto.email} already exists`,
      );
    }
    // bcrypt.hash 方法会将用户输入的密码（dto.password）进行哈希处理，生成一个安全的哈希密码字符串。
    // 第二个参数10是盐的轮数，表示在哈希过程中会进行10轮的加盐处理，以增加哈希密码的安全性。
    // 这个方法返回一个Promise，所以我们使用await来等待哈希处理完成，并将结果赋值给hashedPassword变量。
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.userDao.create({ ...dto, password: hashedPassword });
  }
  async update(id: string, dto: UpdateUserDto) {
    // const user = this.findOne(id);
    // if (!user) {
    //   throw new NotFoundException(`User with id ${id} not found`);
    // }
    // Object.assign(user, dto);
    // user.updatedAt = new Date();
    // const { password, ...result } = user;
    // return result;
    await this.findOne(id); //先检查用户是否存在，如果不存在会抛出NotFoundException异常
    return this.userDao.updateById(id, dto);
  }
  async remove(id: string) {
    // const index = this.users.findIndex((user) => user.id === id);
    // if (index === -1) {
    //   throw new NotFoundException(`User with id ${id} not found`);
    // }
    // this.users.splice(index, 1);
    await this.findOne(id); //先检查用户是否存在，如果不存在会抛出NotFoundException异常
    return this.userDao.deleteById(id);
  }
}
