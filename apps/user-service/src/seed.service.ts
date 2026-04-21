import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '@app/common';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // OnApplicationBootstrap：NestJS 生命周期钩子，所有模块初始化完成后自动执行
  async onApplicationBootstrap() {
    const adminName = 'admin';
    const exists = await this.userModel.findOne({ name: adminName });

    if (exists) {
      this.logger.log('Admin user already exists, skipping seed.');
      return;
    }

    const password = process.env.ADMIN_INIT_PASSWORD ?? 'admin123';
    const email = process.env.ADMIN_INIT_EMAIL ?? 'admin@example.com';
    const hashed = await bcrypt.hash(password, 10);

    await this.userModel.create({
      name: adminName,
      email,
      password: hashed,
    });

    this.logger.log(`Admin user created. email: ${email}`);
  }
}
