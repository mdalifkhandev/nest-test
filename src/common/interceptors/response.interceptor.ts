import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const statusCode = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>().statusCode;

    return next.handle().pipe(
      map((data) => {
        // If service already returns our format, pass through
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'statusCode' in data
        ) {
          return data as unknown as ApiResponse<T>;
        }

        return {
          success: true,
          statusCode,
          message: 'Success',
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
