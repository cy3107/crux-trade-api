import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class MarketsService {
  constructor(private supabaseService: SupabaseService) {}

  async getAllMarkets() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('markets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      // 黑客松备用：返回硬编码 mock 数据，永不崩溃
      return this.getMockMarkets();
    }

    return data?.length ? data : this.getMockMarkets();
  }

  // 保险起见：数据库挂了也能演示
  private getMockMarkets() {
    return [
      {
        id: '1',
        token_symbol: 'BTC',
        token_name: 'Bitcoin',
        current_price: 45234.5,
        change_24h_pct: 5.2,
        volatility: 45,
        unlock_progress_pct: 45,
        is_hot: true,
        ending_soon: false,
      },
      {
        id: '2',
        token_symbol: 'ETH',
        token_name: 'Ethereum',
        current_price: 2845.12,
        change_24h_pct: -2.3,
        volatility: 67,
        unlock_progress_pct: 67,
        is_hot: false,
        ending_soon: true,
      },
      {
        id: '3',
        token_symbol: 'DOGE',
        token_name: 'Dogecoin',
        current_price: 0.1245,
        change_24h_pct: 1.8,
        volatility: 82,
        unlock_progress_pct: 82,
        is_hot: true,
        ending_soon: false,
      },
    ];
  }

  async getMarketById(id: string) {
    const { data, error } = await this.supabaseService
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
