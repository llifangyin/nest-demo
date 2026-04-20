import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ExportTask, EXPORT_SERVICE } from '@app/common';

@Injectable()
export class ExportService {
  constructor(
    @Inject(EXPORT_SERVICE) private readonly client: ClientProxy,
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
  ) {}

  async triggerExport(filter: { name?: string; email?: string }) {
    const taskId = randomUUID();
    await this.taskModel.create({ taskId, status: 'pending' });
    this.client.emit('export_user', { taskId, filter });
    return { taskId, message: '导出任务已创建' };
  }

  async getTaskStatus(taskId: string) {
    const task = await this.taskModel.findOne({ taskId });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }
}