import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '../../../../libs/common/src/exceptions/error-code';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCodes.UNCATEGORIZED_EXCEPTION.errorCode;
    let message = 'Uncategorized error';

    // 1. Nhận lỗi đã đóng gói từ Microservice gửi về qua TCP client
    if (exception && typeof exception === 'object' && exception.code !== undefined) {
      status = exception.statusCode || HttpStatus.BAD_REQUEST;
      errorCode = exception.code;
      message = exception.message;
    }
    // 2. Lỗi ném trực tiếp từ Gateway (ví dụ validation pipe, jwt guard, ...)
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      message = typeof res === 'object' ? (Array.isArray(res.message) ? res.message.join(', ') : res.message) : res;
      
      if (status === HttpStatus.NOT_FOUND) {
        errorCode = ErrorCodes.USER_NOT_EXISTED.errorCode;
      } else if (status === HttpStatus.UNAUTHORIZED) {
        errorCode = ErrorCodes.UNAUTHENTICATED.errorCode;
      } else if (status === HttpStatus.FORBIDDEN) {
        errorCode = ErrorCodes.UNAUTHORIZED.errorCode;
      } else if (status === HttpStatus.BAD_REQUEST) {
        errorCode = ErrorCodes.INVALID_KEY.errorCode;
      }
    }
    // 3. Lỗi runtime thuần túy
    else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      code: errorCode,
      message,
    });
  }
}
