import { Controller, Get } from '@nestjs/common';
import { ExportWorkerService } from './export-worker.service';

@Controller()
export class ExportWorkerController {
  constructor(private readonly exportWorkerService: ExportWorkerService) {}

  @Get()
  getHello(): string {
    return this.exportWorkerService.getHello();
  }
}
