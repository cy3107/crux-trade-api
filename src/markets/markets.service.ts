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

  /**
   * 批量插入或更新 meme 币市场数据
   * 先查询是否存在，存在则更新，不存在则插入
   */
  async upsertMemeCoins(coins: Omit<MarketRecord, 'id' | 'created_at'>[]): Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let inserted = 0;
    let updated = 0;

    for (const coin of coins) {
      try {
        // 先查询是否存在
        const { data: existing } = await this.supabaseService
          .getClient()
          .from('markets')
          .select('id')
          .eq('token_symbol', coin.token_symbol)
          .maybeSingle();

        const marketData = {
          token_symbol: coin.token_symbol,
          token_name: coin.token_name,
          category: coin.category || 'meme',
          current_price: coin.current_price,
          change_24h_pct: coin.change_24h_pct,
          volatility: coin.volatility,
          volatility_level: this.getVolatilityLevel(coin.volatility || 0),
          is_hot: coin.is_hot || false,
          ending_soon: coin.ending_soon || false,
          icon: this.getMemeIcon(coin.token_symbol),
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // 存在则更新
          const { error } = await this.supabaseService
            .getClient()
            .from('markets')
            .update(marketData)
            .eq('id', existing.id);

          if (error) {
            errors.push(`${coin.token_symbol}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          // 不存在则插入
          const { error } = await this.supabaseService
            .getClient()
            .from('markets')
            .insert({
              ...marketData,
              unlock_progress_pct: coin.unlock_progress_pct || Math.floor(Math.random() * 100),
              unlock_cost_usdc: coin.unlock_cost_usdc || 0.5,
            });

          if (error) {
            errors.push(`${coin.token_symbol}: ${error.message}`);
          } else {
            inserted++;
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${coin.token_symbol}: ${errMsg}`);
      }
    }

    return {
      success: errors.length === 0,
      inserted,
      updated,
      errors,
    };
  }

  private getVolatilityLevel(volatility: number): string {
    if (volatility >= 70) return 'high';
    if (volatility >= 40) return 'medium';
    return 'low';
  }

  private getMemeIcon(symbol: string): string {
    const icons: Record<string, string> = {
      DOGE: 'Ð',
      SHIB: '🐕',
      PEPE: '🐸',
      FLOKI: '🐶',
      BONK: '🦴',
      WIF: '🎩',
      MEME: '😂',
      TURBO: '🚀',
      WOJAK: '😢',
      BABYDOGE: '🐾',
    };
    return icons[symbol.toUpperCase()] || '🪙';
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
