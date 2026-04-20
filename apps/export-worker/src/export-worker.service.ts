import { Injectable } from '@nestjs/common';

@Injectable()
export class ExportWorkerService {
  getHello(): string {
    return 'Hello World!';
  }
}
