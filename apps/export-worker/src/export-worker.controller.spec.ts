import { Test, TestingModule } from '@nestjs/testing';
import { ExportWorkerController } from './export-worker.controller';
import { ExportWorkerService } from './export-worker.service';

describe('ExportWorkerController', () => {
  let exportWorkerController: ExportWorkerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ExportWorkerController],
      providers: [ExportWorkerService],
    }).compile();

    exportWorkerController = app.get<ExportWorkerController>(ExportWorkerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(exportWorkerController.getHello()).toBe('Hello World!');
    });
  });
});
