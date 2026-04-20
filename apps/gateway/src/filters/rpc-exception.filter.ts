import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Response } from 'express';

/**
 * 捕获从微服务透传回来的 RpcException，转成 HTTP 响应
 */
@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const rpcError = exception.getError();

    if (typeof rpcError === 'object' && rpcError !== null) {
      const error = rpcError as { statusCode?: number; message?: string };
      const status = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        statusCode: status,
        message: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    } else {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: rpcError || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
