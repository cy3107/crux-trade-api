import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => import('@nestjs/common').then(m => m.SetMetadata(IS_PUBLIC_KEY, true));

/**
 * 简单的 API Key 认证守卫
 * 开发阶段使用，生产环境建议使用 JWT
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 检查是否为公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] || request.query.apiKey;

    // 开发模式下可以跳过认证
    const isDev = this.configService.get('NODE_ENV') !== 'production';
    const devSkipAuth = this.configService.get('DEV_SKIP_AUTH') === 'true';

    if (isDev && devSkipAuth) {
      return true;
    }

    // 验证 API Key
    const validApiKey = this.configService.get('API_KEY');

    if (!validApiKey) {
      // 如果没有配置 API Key，开发环境下允许访问
      if (isDev) {
        return true;
      }
      throw new UnauthorizedException('API Key not configured');
    }

    if (!apiKey) {
      throw new UnauthorizedException('API Key is required. Please provide X-API-Key header.');
    }

    if (apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid API Key');
    }

    return true;
  }
}
