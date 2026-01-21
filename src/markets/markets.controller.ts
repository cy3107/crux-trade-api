import { Controller, Get, Param } from '@nestjs/common';
import { MarketsService, type MarketRecord } from './markets.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('markets')
@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  private mapMarket(market: MarketRecord): {
    id: string;
    tokenSymbol: string;
    tokenName: string;
    category?: string | null;
    currentPrice: number;
    change24hPct: number;
    volatility?: number | null;
    volatilityLevel: 'low' | 'medium' | 'high';
    unlockProgressPct?: number | null;
    unlockCostUsdc: number;
    isHot?: boolean | null;
    endingSoon?: boolean | null;
    icon?: string;
    createdAt: string;
    updatedAt: string;
  } {
    const now = new Date().toISOString();
    const volatilityLevel = this.getVolatilityLevel(market.volatility);
    return {
      id: market.id,
      tokenSymbol: market.token_symbol,
      tokenName: market.token_name,
      category: market.category,
      currentPrice: market.current_price ?? 0, // 使用空值合并运算符提供默认值
      change24hPct: market.change_24h_pct,
      volatility: market.volatility,
      volatilityLevel,
      unlockProgressPct: market.unlock_progress_pct,
      unlockCostUsdc: market.unlock_cost_usdc ?? 0.5,
      isHot: market.is_hot,
      endingSoon: market.ending_soon,
      icon: this.getMarketIcon(market.token_symbol),
      createdAt: market.created_at ?? now,
      updatedAt: market.updated_at ?? now,
    };
  }

  private getVolatilityLevel(
    volatility?: number | null,
  ): 'low' | 'medium' | 'high' {
    const value = volatility ?? 0;
    if (value >= 70) return 'high';
    if (value >= 40) return 'medium';
    return 'low';
  }

  private getMarketIcon(symbol: string): string | undefined {
    const iconMap: Record<string, string> = {
      BTC: '₿',
      ETH: 'Ξ',
      SOL: '◎',
      DOGE: 'Ð',
    };
    return iconMap[symbol.toUpperCase()];
  }

  @Get()
  @ApiOperation({ summary: '获取所有预测市场（首页列表）' })
  async getMarkets() {
    const markets: MarketRecord[] = await this.marketsService.getAllMarkets();
    return {
      success: true,
      data: markets.map((market) => this.mapMarket(market)),
    };
  }

  @Get('top-unlock')
  @ApiOperation({ summary: '获取解锁进度最高的市场（Top Unlock）' })
  async getTopUnlock() {
    const markets: MarketRecord[] = await this.marketsService.getAllMarkets();
    const sorted = [...markets].sort(
      (a, b) => (b.unlock_progress_pct ?? 0) - (a.unlock_progress_pct ?? 0),
    );

    return {
      success: true,
      data: sorted.slice(0, 3).map((market) => ({
        marketId: market.id,
        tokenSymbol: market.token_symbol,
        tokenName: market.token_name,
        unlockProgressPct: market.unlock_progress_pct ?? 0,
        unlockCostUsdc: market.unlock_cost_usdc ?? 0.5,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个市场详情 + 完整 AI Insight' })
  async getMarketDetail(@Param('id') id: string) {
    const market: MarketRecord = await this.marketsService.getMarketById(id);
    const changePct = Number(market?.change_24h_pct ?? 0);

    const aiInsight = {
      signal: changePct > 0 ? 'bullish' : 'bearish',
      confidencePct: 72,
      volatilityLevel: 'medium',
      description: 'Medium volatility detected',
      insights: [
        'Social buzz ↑ 35%',
        'On-chain volume ↑ 20%',
        'Holder count rising',
        'Whale accumulation detected',
      ],
    };

    return {
      success: true,
      data: {
        ...this.mapMarket(market),
        aiInsight,
      },
    };
  }
}
