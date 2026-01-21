import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// 装饰器：设置速率限制
export const RATE_LIMIT_KEY = 'rateLimit';
export interface RateLimitOptions {
  limit: number;      // 请求次数限制
  windowMs: number;   // 时间窗口（毫秒）
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

// 请求记录
interface RequestRecord {
  count: number;
  resetTime: number;
}

/**
 * 简单的速率限制守卫
 * 基于 IP 地址限制请求频率
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  // 内存存储请求记录（生产环境建议使用 Redis）
  private requestRecords: Map<string, RequestRecord> = new Map();

  // 默认配置：每分钟 30 次请求
  private defaultLimit = 30;
  private defaultWindowMs = 60 * 1000;

  constructor(private reflector: Reflector) {
    // 定期清理过期记录
    setInterval(() => this.cleanupExpiredRecords(), 60 * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 获取客户端标识（IP + API Key）
    const clientId = this.getClientId(request);

    // 获取限制配置
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || {
      limit: this.defaultLimit,
      windowMs: this.defaultWindowMs,
    };

    const now = Date.now();
    const record = this.requestRecords.get(clientId);

    if (!record || now > record.resetTime) {
      // 新窗口或已过期
      this.requestRecords.set(clientId, {
        count: 1,
        resetTime: now + options.windowMs,
      });
      return true;
    }

    if (record.count >= options.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Please try again in ${retryAfter} seconds.`,
            userMessage: `请求过于频繁，请在 ${retryAfter} 秒后重试`,
            retryAfter,
          },
          timestamp: new Date().toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 增加计数
    record.count++;
    return true;
  }

  private getClientId(request: any): string {
    // 优先使用 API Key 作为标识
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      return `key:${apiKey}`;
    }

    // 否则使用 IP 地址
    const ip =
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip ||
      'unknown';

    return `ip:${ip}`;
  }

  private cleanupExpiredRecords(): void {
    const now = Date.now();
    for (const [key, record] of this.requestRecords.entries()) {
      if (now > record.resetTime) {
        this.requestRecords.delete(key);
      }
    }
  }
}
