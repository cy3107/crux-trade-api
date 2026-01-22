import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PostgrestError } from '@supabase/supabase-js';

type OrderRow = {
  id: string;
  order_id: string;
  user_id: string;
  market_id: string;
  direction: string;
  order_type: string;
  limit_price: number | string | null;
  shares: number | string;
  status: string;
  filled_price: number | string | null;
  tx_hash: string | null;
  created_at: string;
};

type OrderResponse = {
  orderId: string;
  direction: string;
  orderType: string;
  shares: number;
  status: string;
  filledPrice: number;
  createdAt: string;
  txHash?: string | null;
};

type CreateOrderInput = {
  marketId: string;
  direction: 'Up' | 'Down';
  orderType: 'Market' | 'Limit';
  limitPrice?: number;
  shares: number;
};

@Injectable()
export class OrdersService {
  constructor(private supabaseService: SupabaseService) {}

  private toNumber(value: number | string | null) {
    return value == null ? 0 : Number(value);
  }

  private mapOrder(row: OrderRow): OrderResponse {
    return {
      orderId: row.order_id,
      direction: row.direction,
      orderType: row.order_type,
      shares: this.toNumber(row.shares),
      status: row.status,
      filledPrice: this.toNumber(row.filled_price),
      createdAt: row.created_at,
      txHash: row.tx_hash,
    };
  }

  async createOrder(userId: string, input: CreateOrderInput) {
    const orderId = `order-${Date.now()}`;
    const payload = {
      order_id: orderId,
      user_id: userId,
      market_id: input.marketId,
      direction: input.direction,
      order_type: input.orderType,
      limit_price: input.limitPrice ?? null,
      shares: input.shares,
      status: 'pending',
      filled_price: input.orderType === 'Market' ? 0.52 : null,
      tx_hash: '0xabc123',
    };

    const {
      data,
      error,
    }: { data: OrderRow | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('orders')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
      throw new Error(`Create order failed: ${error.message}`);
    }

    return this.mapOrder(data as OrderRow);
  }

  async getOrders(userId: string, marketId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (marketId) {
      query = query.eq('market_id', marketId);
    }

    const {
      data,
      error,
    }: { data: OrderRow[] | null; error: PostgrestError | null } = await query;

    if (error) {
      throw new Error(`Get orders failed: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapOrder(row));
  }
}
