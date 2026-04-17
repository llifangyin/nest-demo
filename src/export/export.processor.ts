import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { ExportTask } from './schemas/export-task.schema';
import { UserDao } from '../users/dao/user.dao';

@Controller()
export class ExportProcessor {
  constructor(
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
    private readonly userDao: UserDao,
  ) {}
  // 监听 RabbitMQ 中的 export_user 消息，当有新的导出请求时触发这个方法
  @EventPattern('export_user')
  async handleExportUsers(
    @Payload()
    data: {
      taskId: string;
      filter: { name?: string; email?: string };
    },
  ) {
    const { taskId, filter } = data;

    // 1. 更新任务状态为 processing
    await this.taskModel.updateOne({ taskId }, { status: 'processing' });

    try {
      // 2. 查询用户数据，根据过滤条件
      const users = await this.userDao.findAll(filter);
      // 3. 模拟导出过程，生成 CSV 文件
      const csvRows = [
        'name,email,createdAt',
        ...users.map((u: any) => `${u.name},${u.email},${u.createdAt}`),
      ];
      const csvContent = csvRows.join('\n');

      // 4. 将 CSV 内容写入文件，文件名包含任务ID，保存在 exports 目录下
      const fileName = `export_${taskId}.csv`;
      const filePath = path.join(__dirname, '..', 'exports', fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, csvContent, 'utf-8');

      // 5. 更新任务状态为 done
      await this.taskModel.updateOne({ taskId }, { status: 'done', filePath });
    } catch (error) {
      // 更新任务状态为 failed
      await this.taskModel.updateOne({ taskId }, { status: 'failed' });
    }
  }
}
