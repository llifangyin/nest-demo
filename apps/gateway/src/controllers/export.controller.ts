import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { ExportService } from '../services/export.service';
import { Public } from '../auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Throttle({ short: { ttl: 60000, limit: 3 } }) // 每分钟最多请求3次（ttl 单位：毫秒）
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('users')
  triggerExport(@Body() filter: { name?: string; email?: string }) {
    return this.exportService.triggerExport(filter);
  }

  @Get('status/:taskId')
  getTaskStatus(@Param('taskId') taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }

  @Public()
  @Get('download/:taskId')
  async download(@Param('taskId') taskId: string, @Res() res: Response) {
    const task = await this.exportService.getTaskStatus(taskId);
    if (!task || task.status !== 'done' || !task.filePath) {
      return res.status(404).json({ message: 'File not found or not ready' });
    }
    const fileName = path.basename(task.filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(task.filePath, { root: '/' });
  }
}