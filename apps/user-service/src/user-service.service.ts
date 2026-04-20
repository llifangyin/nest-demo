import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { UpdateUserDto, CreateUserDto } from '@app/common';
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
export class UserService {
  constructor(
    private readonly userDao: UserDao,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}
  async findAll(name?: string, email?: string): Promise<User[]> {
    const cacheKey = `users:${name || ''}:${email || ''}`;
    const cached = await this.cacheManager.get<User[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.userDao.findAll({ name, email });
    await this.cacheManager.set(cacheKey, data, 60000); // 缓存1分钟
    return data;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userDao.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }
  async findByName(name: string): Promise<User> {
    const user = await this.userDao.findByName(name);
    if (!user) {
      throw new NotFoundException(`User with name ${name} not found`);
    }
    return user;
  }
  async create(dto: CreateUserDto) {
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
    await this.findOne(id); //先检查用户是否存在，如果不存在会抛出NotFoundException异常
    return this.userDao.updateById(id, dto);
  }
  async remove(id: string) {
    await this.findOne(id); //先检查用户是否存在，如果不存在会抛出NotFoundException异常
    return this.userDao.deleteById(id);
  }
}
