import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 扩展 NestJS 内置 ConsoleLogger：
 *  - 控制台：正常彩色输出（保持原来效果）
 *  - 文件：error / warn 级别写入 logs/error.log
 */
export class FileLogger extends ConsoleLogger {
  private readonly logDir = path.resolve(process.cwd(), 'logs');
  private readonly errorLogPath: string;

  constructor() {
    super();
    // 确保 logs/ 目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.errorLogPath = path.join(this.logDir, 'error.log');
  }

  /** 拼接一行日志文本写入文件 */
  private writeToFile(level: string, message: unknown, context?: string) {
    const timestamp = new Date().toISOString();
    const ctx = context ?? this.context ?? 'App';
    const line = `[${timestamp}] [${level}] [${ctx}] ${String(message)}\n`;
    fs.appendFileSync(this.errorLogPath, line, 'utf8');
  }

  override error(message: unknown, stack?: string, context?: string) {
    super.error(message, stack, context);
    this.writeToFile('ERROR', message, context);
    if (stack) {
      this.writeToFile('STACK', stack, context);
    }
  }

  override warn(message: unknown, context?: string) {
    super.warn(message, context);
    this.writeToFile('WARN', message, context);
  }
}
