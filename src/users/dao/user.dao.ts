import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument} from '../schemas/user.schema';

// Model 是一个Mongoose模型类，用于操作MongoDB中的用户数据集合。通过@InjectModel(User.name)装饰器将User模型注入到UsersService中，使得我们可以在服务中使用这个模型来进行数据库操作。

@Injectable()
export class UserDao {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>, // 注入User模型
  ) {}
  findAll(filter: { name?: string; email?: string } = {}): Promise<User[]> {
    const query: { name?: RegExp; email?: RegExp } = {};
    if (filter.name) {
      query.name = new RegExp(filter.name, 'i'); // 模糊查询，忽略大小写
    }
    if (filter.email) {
      query.email = new RegExp(filter.email, 'i'); // 模糊查询，忽略大小写
    }
    return this.userModel.find(query).select('-password').exec();
  }
  findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }
  findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }
  findByName(name: string): Promise<User | null> {
    return this.userModel.findOne({ name }).exec();
  }
  create(user: Partial<User>): Promise<User> {
    //  id、createdAt和updatedAt字段会由Mongoose自动生成和维护，所以我们只需要传入name、email和password字段即可。
    return this.userModel.create(user);
  }
  updateById(id: string, user: Partial<User>): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(id, user, { new: true }).exec();
  }
  deleteById(id: string): Promise<User | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }
  exists(filter: Partial<User>) {
    return this.userModel.exists(filter);
  }
}
