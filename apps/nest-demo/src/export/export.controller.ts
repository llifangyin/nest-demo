import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { ExportService } from './export.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // 触发导出任务，返回任务ID
  @Post('users')
  triggerExport(@Body() filter: { name?: string; email?: string }) {
    return this.exportService.triggerExport(filter);
  }
  //前端轮询： 查询任务状态
  @Get('status/:taskId')
  getTaskStatus(@Param('taskId') taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }
  // 下载导出文件
  @Public()
  @Get('download/:taskId')
  async download(@Param('taskId') taskId: string, @Res() res: Response) {
    const task = await this.exportService.getTaskStatus(taskId);
    if (!task || task.status !== 'done' || !task.filePath) {
      return res.status(404).json({ message: 'File not found or not ready' });
    }
    const fileName = path.basename(task.filePath);
    // 设置响应头，提示浏览器下载文件 Content-Disposition 是告诉浏览器以附件形式下载文件，filename 指定下载后的文件名 Content-Type 告诉浏览器文件类型，这里是 CSV 文件
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(task.filePath);
  }
}
