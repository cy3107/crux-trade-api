import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../common/supabase/supabase.service';

type SettlementStatus = 'Pending' | 'Settling' | 'Settled' | 'Failed' | 'Refunded';
type SettlementResult = 'Win' | 'Lose' | 'Refund' | null;

type SettlementRow = {
  order_id: string;
  status: string;
  result: string | null;
  token: string;
  pair: string;
  direction: string;
  stake: number | string;
  currency: string;
  start_time: string;
  expiry_time: string;
  settled_at: string | null;
  entry_price: number | string | null;
  entry_updated_at: string | null;
  entry_round_id: string | null;
  final_price: number | string | null;
  final_updated_at: string | null;
  final_round_id: string | null;
  fees: number | string | null;
  gross_payout: number | string | null;
  net_payout: number | string | null;
  refund_amount: number | string | null;
  staleness_triggered: boolean | null;
  staleness_seconds: number | null;
  network: string | null;
  chainlink_feed: string | null;
  feed_address: string | null;
  settlement_tx_hash: string | null;
  contract_address: string | null;
};

@ApiTags('settlements')
@Controller()
export class SettlementsController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('settlements/:orderId')
  @ApiOperation({ summary: '获取订单结算详情' })
  async getSettlement(@Param('orderId') orderId: string) {
    return this.buildResponse(orderId);
  }

  @Get('orders/:orderId/settlement')
  @ApiOperation({ summary: '获取订单结算详情（别名）' })
  async getOrderSettlement(@Param('orderId') orderId: string) {
    return this.buildResponse(orderId);
  }

  private toNumber(value: number | string | null): number {
    return value == null ? 0 : Number(value);
  }

  private async buildResponse(orderId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('settlements')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      throw new Error(`Settlement lookup failed: ${error.message}`);
    }

    if (!data) {
      return this.buildMockResponse(orderId);
    }

    const row = data as SettlementRow;

    return {
      success: true,
      data: {
        orderId: row.order_id,
        status: row.status as SettlementStatus,
        result: row.result as SettlementResult,
        token: row.token,
        pair: row.pair,
        direction: row.direction,
        stake: this.toNumber(row.stake),
        currency: row.currency,
        startTime: row.start_time,
        expiryTime: row.expiry_time,
        settledAt: row.settled_at,
        entryPrice: this.toNumber(row.entry_price),
        entryUpdatedAt: row.entry_updated_at,
        entryRoundId: row.entry_round_id,
        finalPrice: this.toNumber(row.final_price),
        finalUpdatedAt: row.final_updated_at,
        finalRoundId: row.final_round_id,
        fees: this.toNumber(row.fees),
        grossPayout: this.toNumber(row.gross_payout),
        netPayout: this.toNumber(row.net_payout),
        refundAmount: this.toNumber(row.refund_amount),
        stalenessTriggered: row.staleness_triggered ?? false,
        stalenessSeconds: row.staleness_seconds ?? 0,
        network: row.network,
        chainlinkFeed: row.chainlink_feed,
        feedAddress: row.feed_address,
        settlementTxHash: row.settlement_tx_hash,
        contractAddress: row.contract_address,
      },
    };
  }

  private buildMockResponse(orderId: string) {
    const status: SettlementStatus = 'Settled';
    const result: SettlementResult = 'Win';
    const startTime = new Date(Date.now() - 3600000).toISOString();
    const expiryTime = new Date(Date.now() - 60000).toISOString();
    const settledAt = new Date().toISOString();
    const entryUpdatedAt = new Date(Date.now() - 3600000).toISOString();
    const finalUpdatedAt = new Date(Date.now() - 60000).toISOString();

    return {
      success: true,
      data: {
        orderId,
        status,
        result,
        token: 'BTC',
        pair: 'BTC/USD',
        direction: 'Long',
        stake: 100,
        currency: 'USDC',
        startTime,
        expiryTime,
        settledAt,
        entryPrice: 43250.5,
        entryUpdatedAt,
        entryRoundId: '18446744073709562891',
        finalPrice: 43680.2,
        finalUpdatedAt,
        finalRoundId: '18446744073709562892',
        fees: 2,
        grossPayout: 195,
        netPayout: 193,
        refundAmount: 0,
        stalenessTriggered: false,
        stalenessSeconds: 0,
        network: 'Ethereum Mainnet',
        chainlinkFeed: 'BTC / USD',
        feedAddress: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
        settlementTxHash:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdef1234',
      },
    };
  }
}
