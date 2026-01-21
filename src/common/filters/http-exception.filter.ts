import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessException, ErrorCode, ErrorMessages } from '../errors/error-codes';

/**
 * 全局 HTTP 异常过滤器
 * 统一处理所有异常，返回标准化的错误响应
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any;

    // 处理业务异常
    if (exception instanceof BusinessException) {
      status = exception.httpStatus;
      errorResponse = exception.toResponse();
    }
    // 处理 NestJS HttpException
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // 如果已经是标准格式，直接使用
      if (typeof exceptionResponse === 'object' && 'error' in (exceptionResponse as any)) {
        errorResponse = exceptionResponse;
      } else {
        // 转换为标准格式
        const message =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any)?.message || 'Unknown error';

        errorResponse = {
          success: false,
          error: {
            code: this.getErrorCodeFromStatus(status),
            message: message,
            userMessage: this.getUserMessage(status, message),
          },
          timestamp: new Date().toISOString(),
        };
      }
    }
    // 处理其他异常
    else {
      const errorMessage = exception instanceof Error ? exception.message : 'Unknown error';

      // 在非生产环境记录详细错误
      if (process.env.NODE_ENV !== 'production') {
        console.error('[GlobalExceptionFilter] Unhandled exception:', exception);
      }

      errorResponse = {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN_ERROR,
          message: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : errorMessage,
          userMessage: '服务器内部错误，请稍后再试',
        },
        timestamp: new Date().toISOString(),
      };
    }

    // 添加请求信息（便于调试）
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.debug = {
        path: request.url,
        method: request.method,
      };
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCodeFromStatus(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 429:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.UNKNOWN_ERROR;
    }
  }

  private getUserMessage(status: number, message: string): string {
    // 检查是否有预定义的中文消息
    const code = this.getErrorCodeFromStatus(status);
    const predefined = ErrorMessages[code];
    if (predefined) {
      return predefined.zh;
    }

    // 根据状态码返回通用消息
    switch (status) {
      case 400:
        return '请求参数错误';
      case 401:
        return '未授权，请提供有效的 API 密钥';
      case 403:
        return '禁止访问';
      case 404:
        return '请求的资源不存在';
      case 429:
        return '请求过于频繁，请稍后再试';
      case 500:
        return '服务器内部错误';
      default:
        return '请求处理失败';
    }
  }
}
