import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface WalletPayload {
  walletAddress: string;
  walletType: 'evm' | 'solana';
  sessionId: string;
}

@Injectable()
export class WalletAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证 token');
    }

    const token = authHeader.substring(7);

    try {
      const payload = this.jwtService.verify<WalletPayload>(token, {
        secret: this.config.get('JWT_SECRET') || 'crux-trade-secret-key-change-in-production',
      });

      // 将钱包信息附加到请求对象
      request.wallet = {
        address: payload.walletAddress,
        type: payload.walletType,
        sessionId: payload.sessionId,
      };

      return true;
    } catch {
      throw new UnauthorizedException('无效的认证 token');
    }
  }
}
