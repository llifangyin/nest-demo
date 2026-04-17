import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ExportTask } from './schemas/export-task.schema';

@Injectable()
export class ExportService {
  constructor(
    @Inject('EXPORT_SERVICE') private readonly client: ClientProxy,
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
  ) {}

  async triggerExport(filter: { name?: string; email?: string }) {
    const taskId = randomUUID(); // 生成唯一的任务ID
    // 创建导出任务，初始状态为 pending
    await this.taskModel.create({ taskId, status: 'pending' });

    // 发送导出请求到 RabbitMQ，携带任务ID和过滤条件
    this.client.emit('export_user', { taskId, filter });

    // 返回任务ID给客户端，客户端可以使用这个ID来查询任务状态和结果
    return { taskId, message: '导出任务已创建' };
  }

  async getTaskStatus(taskId: string) {
    // 根据任务ID查询任务状态和结果
    const task = await this.taskModel.findOne({ taskId });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    return task;
  }
}
