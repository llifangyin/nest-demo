import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  MongooseHealthIndicator,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { USER_SERVICE_PORT, PRODUCT_SERVICE_PORT } from '@app/common';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private microservice: MicroserviceHealthIndicator,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      () =>
        this.microservice.pingCheck('user-service', {
          transport: Transport.TCP,
          options: { host: 'localhost', port: USER_SERVICE_PORT },
        }),
      () =>
        this.microservice.pingCheck('product-service', {
          transport: Transport.TCP,
          options: { host: 'localhost', port: PRODUCT_SERVICE_PORT },
        }),
    ]);
  }
}
