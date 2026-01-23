import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../common/supabase/supabase.service';
import { verifyMessage } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { v4 as uuidv4 } from 'uuid';

interface WalletSession {
  id: string;
  wallet_address: string;
  wallet_type: 'evm' | 'solana';
  challenge_message: string;
  is_verified: boolean;
  session_token: string | null;
  nonce: string;
  expires_at: string;
}

@Injectable()
export class WalletService {
  constructor(
    private supabase: SupabaseService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * 发起钱包连接，返回 challenge 消息
   */
  async connect(walletAddress: string, walletType: 'evm' | 'solana') {
    const nonce = uuidv4();
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟有效

    // 生成 challenge 消息
    const challenge = this.generateChallenge(walletAddress, nonce, timestamp);

    // 存入数据库
    const { data, error } = await this.supabase
      .getClient()
      .from('wallet_sessions')
      .insert({
        wallet_address: walletAddress.toLowerCase(),
        wallet_type: walletType,
        challenge_message: challenge,
        nonce,
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`创建会话失败: ${error.message}`);
    }

    return {
      sessionId: data.id,
      challenge,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * 验证钱包签名
   */
  async verify(sessionId: string, signature: string) {
    // 获取会话
    const { data: session, error } = await this.supabase
      .getClient()
      .from('wallet_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new UnauthorizedException('会话不存在');
    }

    // 检查是否过期
    if (new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedException('会话已过期');
    }

    // 检查是否已验证
    if (session.is_verified) {
      throw new UnauthorizedException('会话已被使用');
    }

    // 验证签名
    const isValid = await this.verifySignature(
      session.wallet_address,
      session.wallet_type,
      session.challenge_message,
      signature,
    );

    if (!isValid) {
      throw new UnauthorizedException('签名验证失败');
    }

    // 生成 JWT token
    const sessionToken = this.jwtService.sign({
      walletAddress: session.wallet_address,
      walletType: session.wallet_type,
      sessionId,
    });

    // 更新会话
    await this.supabase
      .getClient()
      .from('wallet_sessions')
      .update({
        is_verified: true,
        signature,
        session_token: sessionToken,
        verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 延长到24小时
      })
      .eq('id', sessionId);

    return {
      sessionToken,
      walletAddress: session.wallet_address,
      walletType: session.wallet_type,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * 从 token 获取会话信息
   */
  async getSession(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return {
        walletAddress: payload.walletAddress,
        walletType: payload.walletType,
        isVerified: true,
      };
    } catch {
      throw new UnauthorizedException('无效的 session token');
    }
  }

  /**
   * 验证 JWT token 并返回钱包信息
   */
  verifyToken(token: string): { walletAddress: string; walletType: 'evm' | 'solana' } {
    try {
      const payload = this.jwtService.verify(token);
      return {
        walletAddress: payload.walletAddress,
        walletType: payload.walletType,
      };
    } catch {
      throw new UnauthorizedException('无效的认证 token');
    }
  }

  /**
   * 生成 challenge 消息
   */
  private generateChallenge(walletAddress: string, nonce: string, timestamp: string): string {
    return `Crux Trade Authentication

Wallet: ${walletAddress}
Nonce: ${nonce}
Timestamp: ${timestamp}

Sign this message to authenticate with Crux Trade.
This request will not trigger any blockchain transaction.`;
  }

  /**
   * 验证签名
   */
  private async verifySignature(
    walletAddress: string,
    walletType: 'evm' | 'solana',
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      if (walletType === 'evm') {
        return this.verifyEvmSignature(walletAddress, message, signature);
      } else {
        return this.verifySolanaSignature(walletAddress, message, signature);
      }
    } catch (error) {
      console.error('签名验证错误:', error);
      return false;
    }
  }

  /**
   * 验证 EVM 签名
   */
  private verifyEvmSignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const recoveredAddress = verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * 验证 Solana 签名
   */
  private verifySolanaSignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();

      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }
}
