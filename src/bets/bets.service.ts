import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { PaymentsService } from '../payments/payments.service';
import { v4 as uuidv4 } from 'uuid';

interface BetRecord {
  id: string;
  user_wallet_address: string;
  wallet_type: string;
  prediction_id: string | null;
  token_address: string;
  token_symbol: string | null;
  bet_direction: string;
  bet_amount: number;
  bet_currency: string;
  ai_prediction: string;
  ai_confidence: number | null;
  ai_price_target_24h: number | null;
  entry_price: number;
  odds: number;
  potential_payout: number;
  payment_status: string;
  payment_network: string;
  payment_tx_hash: string | null;
  payment_nonce: string | null;
  bet_status: string;
  settlement_price: number | null;
  payout_amount: number | null;
  created_at: string;
  expires_at: string;
}

@Injectable()
export class BetsService {
  private readonly MIN_BET = 0.1;
  private readonly MAX_BET = 100;
  private readonly DEFAULT_ODDS = 1.95;

  constructor(
    private supabase: SupabaseService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * 准备下注 - 创建待支付的下注记录
   */
  async prepareBet(
    walletAddress: string,
    walletType: 'evm' | 'solana',
    predictionId: string,
    tokenAddress: string,
    betDirection: 'bullish' | 'bearish',
    amount: number,
    network: 'base' | 'solana',
  ) {
    // 验证金额
    if (amount < this.MIN_BET || amount > this.MAX_BET) {
      throw new BadRequestException(
        `下注金额必须在 ${this.MIN_BET} 到 ${this.MAX_BET} USDC 之间`,
      );
    }

    // 获取预测信息
    const prediction = await this.getPrediction(predictionId);
    if (!prediction) {
      throw new NotFoundException('预测记录不存在');
    }

    // 计算赔率和潜在收益
    const odds = this.calculateOdds(prediction.confidence, betDirection, prediction.prediction);
    const potentialPayout = amount * odds;

    // 生成支付 nonce
    const paymentNonce = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后结算

    // 创建下注记录
    const { data: bet, error } = await this.supabase
      .getClient()
      .from('bets')
      .insert({
        user_wallet_address: walletAddress.toLowerCase(),
        wallet_type: walletType,
        prediction_id: predictionId,
        token_address: tokenAddress,
        token_symbol: prediction.token_symbol || null,
        bet_direction: betDirection,
        bet_amount: amount,
        bet_currency: 'USDC',
        ai_prediction: prediction.prediction,
        ai_confidence: prediction.confidence,
        ai_price_target_24h: prediction.price_target_24h,
        entry_price: prediction.current_price,
        odds,
        potential_payout: potentialPayout,
        payment_status: 'pending',
        payment_network: network,
        payment_nonce: paymentNonce,
        bet_status: 'active',
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`创建下注记录失败: ${error.message}`);
    }

    // 生成 x402 支付要求
    const paymentRequired = this.paymentsService.createPaymentRequired(
      bet.id,
      amount,
      network,
      paymentNonce,
    );

    return {
      betId: bet.id,
      paymentRequired,
      betDetails: {
        tokenAddress,
        tokenSymbol: prediction.token_symbol,
        betDirection,
        amount,
        odds,
        potentialPayout,
        aiPrediction: prediction.prediction,
        aiConfidence: prediction.confidence,
        entryPrice: prediction.current_price,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  /**
   * 确认下注 - 验证支付并激活下注
   */
  async confirmBet(
    betId: string,
    walletAddress: string,
    paymentSignature: string,
  ) {
    // 获取下注记录
    const { data: bet, error } = await this.supabase
      .getClient()
      .from('bets')
      .select('*')
      .eq('id', betId)
      .eq('user_wallet_address', walletAddress.toLowerCase())
      .single();

    if (error || !bet) {
      throw new NotFoundException('下注记录不存在');
    }

    if (bet.payment_status !== 'pending') {
      throw new BadRequestException('下注已被处理');
    }

    // 验证 x402 支付签名
    const verification = await this.paymentsService.verifyPayment(
      paymentSignature,
      bet.payment_nonce,
      bet.bet_amount,
      bet.payment_network,
    );

    if (!verification.isValid) {
      // 更新支付状态为失败
      await this.supabase
        .getClient()
        .from('bets')
        .update({ payment_status: 'failed' })
        .eq('id', betId);

      throw new BadRequestException('支付验证失败');
    }

    // 更新下注记录为已确认
    const { data: updatedBet, error: updateError } = await this.supabase
      .getClient()
      .from('bets')
      .update({
        payment_status: 'confirmed',
        payment_tx_hash: verification.txHash || null,
      })
      .eq('id', betId)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`更新下注状态失败: ${updateError.message}`);
    }

    return {
      success: true,
      bet: {
        id: updatedBet.id,
        status: updatedBet.bet_status,
        paymentStatus: updatedBet.payment_status,
        txHash: updatedBet.payment_tx_hash,
        potentialPayout: updatedBet.potential_payout,
        expiresAt: updatedBet.expires_at,
      },
    };
  }

  /**
   * 获取用户的下注记录
   */
  async getMyBets(walletAddress: string) {
    const { data: bets, error } = await this.supabase
      .getClient()
      .from('bets')
      .select('*')
      .eq('user_wallet_address', walletAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`获取下注记录失败: ${error.message}`);
    }

    return (bets || []).map((bet: BetRecord) => ({
      id: bet.id,
      tokenAddress: bet.token_address,
      tokenSymbol: bet.token_symbol,
      betDirection: bet.bet_direction,
      amount: bet.bet_amount,
      currency: bet.bet_currency,
      odds: bet.odds,
      potentialPayout: bet.potential_payout,
      paymentStatus: bet.payment_status,
      betStatus: bet.bet_status,
      aiPrediction: bet.ai_prediction,
      aiConfidence: bet.ai_confidence,
      entryPrice: bet.entry_price,
      settlementPrice: bet.settlement_price,
      payoutAmount: bet.payout_amount,
      createdAt: bet.created_at,
      expiresAt: bet.expires_at,
    }));
  }

  /**
   * 获取单个下注详情
   */
  async getBetById(betId: string, walletAddress: string) {
    const { data: bet, error } = await this.supabase
      .getClient()
      .from('bets')
      .select('*')
      .eq('id', betId)
      .eq('user_wallet_address', walletAddress.toLowerCase())
      .single();

    if (error || !bet) {
      throw new NotFoundException('下注记录不存在');
    }

    // 获取关联的预测
    let prediction = null;
    if (bet.prediction_id) {
      const { data } = await this.supabase
        .getClient()
        .from('ai_predictions')
        .select('*')
        .eq('id', bet.prediction_id)
        .single();
      prediction = data;
    }

    return {
      bet: {
        id: bet.id,
        tokenAddress: bet.token_address,
        tokenSymbol: bet.token_symbol,
        betDirection: bet.bet_direction,
        amount: bet.bet_amount,
        currency: bet.bet_currency,
        odds: bet.odds,
        potentialPayout: bet.potential_payout,
        paymentStatus: bet.payment_status,
        paymentNetwork: bet.payment_network,
        paymentTxHash: bet.payment_tx_hash,
        betStatus: bet.bet_status,
        aiPrediction: bet.ai_prediction,
        aiConfidence: bet.ai_confidence,
        aiPriceTarget24h: bet.ai_price_target_24h,
        entryPrice: bet.entry_price,
        settlementPrice: bet.settlement_price,
        payoutAmount: bet.payout_amount,
        createdAt: bet.created_at,
        expiresAt: bet.expires_at,
      },
      prediction,
    };
  }

  /**
   * 获取预测记录
   */
  private async getPrediction(predictionId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ai_predictions')
      .select('*')
      .eq('id', predictionId)
      .single();

    if (error) {
      return null;
    }

    return {
      prediction: data.prediction,
      confidence: data.confidence,
      price_target_24h: data.price_target_24h,
      current_price: data.current_price,
      token_symbol: data.token_address?.split('/').pop() || null,
    };
  }

  /**
   * 计算赔率
   * 基于 AI 信心度和下注方向动态调整
   */
  private calculateOdds(
    confidence: number,
    betDirection: 'bullish' | 'bearish',
    aiPrediction: string,
  ): number {
    // 基础赔率
    let odds = this.DEFAULT_ODDS;

    // 如果用户下注方向与 AI 预测相同，降低赔率（因为更可能赢）
    // 如果相反，提高赔率（因为更可能输）
    if (betDirection === aiPrediction) {
      // 顺势下注，赔率降低
      odds = 1.5 + (100 - confidence) / 100 * 0.8; // 1.5 - 2.3
    } else {
      // 逆势下注，赔率提高
      odds = 1.8 + confidence / 100 * 1.2; // 1.8 - 3.0
    }

    // 四舍五入到两位小数
    return Math.round(odds * 100) / 100;
  }
}
