import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  code: number;
  result: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // Nếu chạy trong ngữ cảnh HTTP, lấy response object
        if (context.getType() === 'http') {
          const response = context.switchToHttp().getResponse();
          
          // Bỏ qua nếu response headers đã được gửi hoặc dữ liệu đã được bọc hoặc là file stream
          if (response.headersSent || (data && data.code !== undefined)) {
            return data;
          }

          // Trường hợp stream response của express (ví dụ: stream audio)
          if (response.statusCode === 206 || (response.statusCode === 200 && data === undefined)) {
            return data;
          }
        }

        return {
          code: 1000,
          result: data ?? null,
        };
      }),
    );
  }
}
