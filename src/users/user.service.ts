import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  private users: User[] = [
    { id: 0, name: 'John Doe', email: 'john.doe@example.com', password: 'password', createdAt: new Date() },
    { id: 1, name: 'Jane Smith', email: 'jane.smith@example.com', password: 'password', createdAt: new Date() }
  ];
  private nextId = 1;

  findAll(name?: string, email?: string): Omit<User, 'password'>[] {
    let list = this.users.map(({ password, ...u }) => u);
    if (name) {
      list = list.filter((u) => u.name.includes(name));
    }
    if (email) {
      list = list.filter((u) => u.email.includes(email));
    }
    return list;
  }

  findOne(id: number): User {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  create(dto: CreateUserDto) {
    const user: User = { id: this.nextId++, createdAt: new Date(), ...dto };
    this.users.push(user);
    const { password, ...result } = user;
    return result;
  }
  update(id: number, dto: UpdateUserDto) {
    const user = this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    Object.assign(user, dto);
    const { password, ...result } = user;
    return result;
  }
  remove(id: number) {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    this.users.splice(index, 1);
  }
}
