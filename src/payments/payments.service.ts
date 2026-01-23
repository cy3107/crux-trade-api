import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaymentRequired {
  amount: string;
  currency: string;
  network: string;
  networkId: string;
  payTo: string;
  validUntil: string;
  nonce: string;
  resource: string;
}

interface VerificationResult {
  isValid: boolean;
  txHash?: string;
  error?: string;
}

@Injectable()
export class PaymentsService {
  // 平台收款地址 (可配置)
  private readonly PLATFORM_WALLET_BASE: string;
  private readonly PLATFORM_WALLET_SOLANA: string;
  private readonly FACILITATOR_URL = 'https://x402-facilitator.coinbase.com';

  constructor(private config: ConfigService) {
    // 从环境变量读取，或使用默认测试地址
    this.PLATFORM_WALLET_BASE =
      this.config.get('PLATFORM_WALLET_BASE') ||
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0Ab1B';
    this.PLATFORM_WALLET_SOLANA =
      this.config.get('PLATFORM_WALLET_SOLANA') ||
      'CruxTrade1111111111111111111111111111111111';
  }

  /**
   * 创建 x402 支付要求
   */
  createPaymentRequired(
    betId: string,
    amount: number,
    network: 'base' | 'solana',
    nonce: string,
  ): PaymentRequired {
    const validUntil = new Date(Date.now() + 5 * 60 * 1000); // 5分钟有效

    return {
      amount: amount.toFixed(6),
      currency: 'USDC',
      network: network,
      networkId: network === 'base' ? 'eip155:8453' : 'solana:mainnet',
      payTo: network === 'base' ? this.PLATFORM_WALLET_BASE : this.PLATFORM_WALLET_SOLANA,
      validUntil: validUntil.toISOString(),
      nonce,
      resource: `/bets/${betId}`,
    };
  }

  /**
   * 验证 x402 支付签名
   *
   * 注意：这是一个简化实现
   * 生产环境应该调用 Coinbase Facilitator API 进行验证
   */
  async verifyPayment(
    paymentSignature: string,
    nonce: string,
    amount: number,
    network: 'base' | 'solana',
  ): Promise<VerificationResult> {
    try {
      // 验证签名格式
      if (!paymentSignature || paymentSignature.length < 10) {
        return { isValid: false, error: '无效的支付签名' };
      }

      // TODO: 在生产环境中，应该调用 Facilitator API 验证
      // const response = await this.callFacilitator(paymentSignature, nonce, amount, network);

      // 目前使用模拟验证逻辑
      // 在真实实现中，这里应该：
      // 1. 调用 Coinbase Facilitator /verify 端点
      // 2. 验证签名的有效性
      // 3. 确认支付已经上链

      const isValid = this.simulateVerification(paymentSignature, nonce);

      if (isValid) {
        // 生成模拟的交易哈希
        const txHash = this.generateMockTxHash(network);
        return { isValid: true, txHash };
      }

      return { isValid: false, error: '支付验证失败' };
    } catch (error) {
      console.error('[Payments] 验证支付失败:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : '验证错误'
      };
    }
  }

  /**
   * 调用 Facilitator API (生产环境使用)
   */
  private async callFacilitator(
    paymentSignature: string,
    nonce: string,
    amount: number,
    network: string,
  ): Promise<VerificationResult> {
    const payTo = network === 'base' ? this.PLATFORM_WALLET_BASE : this.PLATFORM_WALLET_SOLANA;

    const response = await fetch(`${this.FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentSignature,
        paymentRequired: {
          amount: amount.toFixed(6),
          currency: 'USDC',
          networkId: network === 'base' ? 'eip155:8453' : 'solana:mainnet',
          payTo,
          nonce,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Facilitator 验证失败: ${response.status}`);
    }

    const data = await response.json();
    return {
      isValid: data.verified === true,
      txHash: data.transactionHash,
    };
  }

  /**
   * 模拟验证 (开发/演示用)
   */
  private simulateVerification(signature: string, nonce: string): boolean {
    // 简单验证：签名必须存在且 nonce 必须有效
    // 在真实实现中，这里应该验证加密签名
    return signature.length > 10 && nonce.length > 0;
  }

  /**
   * 生成模拟交易哈希 (开发用)
   */
  private generateMockTxHash(network: string): string {
    const randomHex = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    if (network === 'base') {
      return `0x${randomHex}`;
    } else {
      // Solana 签名格式
      return randomHex.substring(0, 88);
    }
  }
}
