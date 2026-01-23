import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface WalletInfo {
  address: string;
  type: 'evm' | 'solana';
  sessionId: string;
}

/**
 * 从请求中提取钱包信息的装饰器
 * 需要配合 WalletAuthGuard 使用
 */
export const Wallet = createParamDecorator(
  (data: keyof WalletInfo | undefined, ctx: ExecutionContext): WalletInfo | string => {
    const request = ctx.switchToHttp().getRequest();
    const wallet = request.wallet as WalletInfo;

    if (!wallet) {
      return null as any;
    }

    return data ? wallet[data] : wallet;
  },
);
