import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ExportTaskStatus = 'pending' | 'processing' | 'done' | 'failed';

@Schema({ timestamps: true })
export class ExportTask {
  @Prop({ required: true })
  taskId!: string; // 任务ID，唯一标识一个导出任务

  @Prop({ required: true })
  status!: ExportTaskStatus; // 任务状态：pending（待处理）、processing（处理中）、done（完成）、failed（失败）

  @Prop()
  filePath?: string; // 导出结果的URL，任务完成后会填充这个字段

  @Prop()
  errorMsg?: string; // 任务失败时的错误信息
}

// 生成 Mongoose 模式 ExportTaskSchema，用于在数据库中创建 ExportTask 集合
export const ExportTaskSchema = SchemaFactory.createForClass(ExportTask);
