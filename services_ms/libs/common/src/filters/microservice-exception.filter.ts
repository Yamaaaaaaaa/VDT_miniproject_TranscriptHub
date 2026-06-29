import { Catch, RpcExceptionFilter, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { AppException, ErrorCodes } from '../exceptions/error-code';

@Catch()
export class MicroserviceExceptionFilter implements RpcExceptionFilter<any> {
  catch(exception: any, host: ArgumentsHost): any {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCodes.UNCATEGORIZED_EXCEPTION.errorCode;
    let message = exception.message || 'Uncategorized error';

    if (exception instanceof AppException) {
      statusCode = exception.errorCodeInfo.httpStatus;
      errorCode = exception.errorCodeInfo.errorCode;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse() as any;
      message = typeof response === 'string' ? response : (response.message || exception.message);
      
      // Ánh xạ nhanh các loại HttpException standard sang mã lỗi dạng số
      if (statusCode === HttpStatus.NOT_FOUND) {
        errorCode = ErrorCodes.USER_NOT_EXISTED.errorCode;
      } else if (statusCode === HttpStatus.UNAUTHORIZED) {
        errorCode = ErrorCodes.UNAUTHENTICATED.errorCode;
      } else if (statusCode === HttpStatus.FORBIDDEN) {
        errorCode = ErrorCodes.UNAUTHORIZED.errorCode;
      } else if (statusCode === HttpStatus.BAD_REQUEST) {
        errorCode = ErrorCodes.INVALID_KEY.errorCode;
      }
    } else if (exception.code) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorCode = ErrorCodes.INVALID_KEY.errorCode;
      message = `Database constraint violated (Code: ${exception.code})`;
    }

    // Nếu chạy trong ngữ cảnh HTTP (dành cho file service hybrid app)
    if (host.getType() === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse();
      return response.status(statusCode).json({
        code: errorCode,
        message,
      });
    }

    // Ngữ cảnh RPC (TCP)
    return throwError(() => ({
      statusCode,
      code: errorCode,
      message,
    }));
  }
}
