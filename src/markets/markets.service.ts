import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PostgrestError } from '@supabase/supabase-js';

export type MarketRecord = {
  id: string;
  token_symbol: string;
  token_name: string;
  category?: string | null;
  current_price: number;
  change_24h_pct: number;
  volatility?: number | null;
  unlock_progress_pct?: number | null;
  unlock_cost_usdc?: number | null;
  is_hot?: boolean | null;
  ending_soon?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@Injectable()
export class MarketsService {
  constructor(private supabaseService: SupabaseService) {}

  async getAllMarkets(): Promise<MarketRecord[]> {
    const {
      data,
      error,
    }: { data: MarketRecord[] | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      // 黑客松备用：返回硬编码 mock 数据，永不崩溃
      return this.getMockMarkets();
    }

    const rows = data ?? [];
    return rows.length ? rows : this.getMockMarkets();
  }

  // 保险起见：数据库挂了也能演示
  private getMockMarkets(): MarketRecord[] {
    return [
      {
        id: '1',
        token_symbol: 'BTC',
        token_name: 'Bitcoin',
        category: 'mainstream',
        current_price: 45234.5,
        change_24h_pct: 5.2,
        volatility: 45,
        unlock_progress_pct: 45,
        unlock_cost_usdc: 0.5,
        is_hot: true,
        ending_soon: false,
        created_at: '2026-01-20T00:00:00.000Z',
        updated_at: '2026-01-20T00:00:00.000Z',
      },
      {
        id: '2',
        token_symbol: 'ETH',
        token_name: 'Ethereum',
        category: 'mainstream',
        current_price: 2845.12,
        change_24h_pct: -2.3,
        volatility: 67,
        unlock_progress_pct: 67,
        unlock_cost_usdc: 0.5,
        is_hot: false,
        ending_soon: true,
        created_at: '2026-01-20T00:00:00.000Z',
        updated_at: '2026-01-20T00:00:00.000Z',
      },
      {
        id: '3',
        token_symbol: 'DOGE',
        token_name: 'Dogecoin',
        category: 'meme',
        current_price: 0.1245,
        change_24h_pct: 1.8,
        volatility: 82,
        unlock_progress_pct: 82,
        unlock_cost_usdc: 0.5,
        is_hot: true,
        ending_soon: false,
        created_at: '2026-01-20T00:00:00.000Z',
        updated_at: '2026-01-20T00:00:00.000Z',
      },
    ];
  }

  async getMarketById(id: string): Promise<MarketRecord> {
    const {
      data,
      error,
    }: { data: MarketRecord | null; error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('markets')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error || !data) {
      const fallback =
        this.getMockMarkets().find((market) => market.id === id) ??
        this.getMockMarkets()[0];
      return fallback;
    }

    return data;
  }
}
