import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { ExportTask } from '@app/common';  // ← 改这里
import { UserDao } from './dao/user.dao';

@Controller()
export class ExportProcessor {
  constructor(
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
    private readonly userDao: UserDao,
  ) {}

  @EventPattern('export_user')
  async handleExportUsers(
    @Payload() data: { taskId: string; filter: { name?: string; email?: string } },
  ) {
    const { taskId, filter } = data;
    await this.taskModel.updateOne({ taskId }, { status: 'processing' });

    try {
      const users = await this.userDao.findAll(filter);
      const csvRows = [
        'name,email,createdAt',
        ...users.map((u: any) => `${u.name},${u.email},${u.createdAt}`),
      ];
      const csvContent = csvRows.join('\n');

      const fileName = `export_${taskId}.csv`;
      const filePath = path.join(__dirname, '..', 'exports', fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, csvContent, 'utf-8');

      await this.taskModel.updateOne({ taskId }, { status: 'done', filePath });
    } catch (error) {
      await this.taskModel.updateOne(
        { taskId },
        { status: 'failed', errorMsg: String(error) },
      );
    }
  }
}