import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  marketCapRank: number;
  totalVolume: number;
  high24h: number;
  low24h: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  priceChangePercentage7d: number;
  priceChangePercentage30d: number;
  circulatingSupply: number;
  totalSupply: number;
  ath: number;
  athChangePercentage: number;
  athDate: string;
  atl: number;
  atlChangePercentage: number;
  atlDate: string;
  lastUpdated: string;
}

export interface CoinGeckoTrending {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number;
  score: number;
}

@Injectable()
export class CoinGeckoProvider {
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3';
  private proxyAgent: ProxyAgent | null = null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1分钟缓存

  constructor(private config: ConfigService) {
    const proxyUrl = this.config.get('HTTP_PROXY') || this.config.get('HTTPS_PROXY');
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent(proxyUrl);
    }
  }

  private async fetchWithProxy(url: string, options: any = {}): Promise<Response> {
    const fetchOptions: any = {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    if (this.proxyAgent) {
      fetchOptions.dispatcher = this.proxyAgent;
    }

    // CoinGecko API Key (可选，提高限额)
    const apiKey = this.config.get('COINGECKO_API_KEY');
    if (apiKey) {
      fetchOptions.headers['x-cg-demo-api-key'] = apiKey;
    }

    return undiciFetch(url, fetchOptions) as unknown as Response;
  }

  private getCacheKey(method: string, params: string): string {
    return `${method}:${params}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * 通过合约地址获取代币信息
   */
  async getTokenByContract(
    contractAddress: string,
    platform: string = 'ethereum'
  ): Promise<CoinGeckoPrice | null> {
    const cacheKey = this.getCacheKey('contract', `${platform}:${contractAddress}`);
    const cached = this.getFromCache<CoinGeckoPrice>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/coins/${platform}/contract/${contractAddress}`
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const result = this.mapCoinData(data);
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('[CoinGecko] 获取合约代币失败:', error);
      return null;
    }
  }

  /**
   * 通过代币符号搜索
   */
  async searchToken(query: string): Promise<{ id: string; symbol: string; name: string }[]> {
    const cacheKey = this.getCacheKey('search', query);
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/search?query=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const coins = (data.coins || []).slice(0, 10).map((c: any) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
      }));

      this.setCache(cacheKey, coins);
      return coins;
    } catch (error) {
      console.warn('[CoinGecko] 搜索代币失败:', error);
      return [];
    }
  }

  /**
   * 获取代币详细市场数据
   */
  async getTokenMarketData(coinId: string): Promise<CoinGeckoPrice | null> {
    const cacheKey = this.getCacheKey('market', coinId);
    const cached = this.getFromCache<CoinGeckoPrice>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithProxy(
        `${this.BASE_URL}/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=false&sparkline=false`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const result = this.mapCoinData(data);
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('[CoinGecko] 获取市场数据失败:', error);
      return null;
    }
  }

  /**
   * 获取热门趋势代币
   */
  async getTrendingTokens(): Promise<CoinGeckoTrending[]> {
    const cacheKey = this.getCacheKey('trending', 'all');
    const cached = this.getFromCache<CoinGeckoTrending[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithProxy(`${this.BASE_URL}/search/trending`);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const trending = (data.coins || []).map((item: any) => ({
        id: item.item.id,
        symbol: item.item.symbol,
        name: item.item.name,
        marketCapRank: item.item.market_cap_rank,
        score: item.item.score,
      }));

      this.setCache(cacheKey, trending);
      return trending;
    } catch (error) {
      console.warn('[CoinGecko] 获取热门代币失败:', error);
      return [];
    }
  }

  /**
   * 获取全球市场数据
   */
  async getGlobalMarketData(): Promise<{
    totalMarketCap: number;
    totalVolume: number;
    btcDominance: number;
    ethDominance: number;
    marketCapChange24h: number;
  } | null> {
    const cacheKey = this.getCacheKey('global', 'all');
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithProxy(`${this.BASE_URL}/global`);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const result = {
        totalMarketCap: data.data.total_market_cap?.usd || 0,
        totalVolume: data.data.total_volume?.usd || 0,
        btcDominance: data.data.market_cap_percentage?.btc || 0,
        ethDominance: data.data.market_cap_percentage?.eth || 0,
        marketCapChange24h: data.data.market_cap_change_percentage_24h_usd || 0,
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('[CoinGecko] 获取全球数据失败:', error);
      return null;
    }
  }

  /**
   * 映射 CoinGecko 数据到标准格式
   */
  private mapCoinData(data: any): CoinGeckoPrice {
    const market = data.market_data || {};
    return {
      id: data.id,
      symbol: data.symbol?.toUpperCase(),
      name: data.name,
      currentPrice: market.current_price?.usd || 0,
      marketCap: market.market_cap?.usd || 0,
      marketCapRank: data.market_cap_rank || 0,
      totalVolume: market.total_volume?.usd || 0,
      high24h: market.high_24h?.usd || 0,
      low24h: market.low_24h?.usd || 0,
      priceChange24h: market.price_change_24h || 0,
      priceChangePercentage24h: market.price_change_percentage_24h || 0,
      priceChangePercentage7d: market.price_change_percentage_7d || 0,
      priceChangePercentage30d: market.price_change_percentage_30d || 0,
      circulatingSupply: market.circulating_supply || 0,
      totalSupply: market.total_supply || 0,
      ath: market.ath?.usd || 0,
      athChangePercentage: market.ath_change_percentage?.usd || 0,
      athDate: market.ath_date?.usd || '',
      atl: market.atl?.usd || 0,
      atlChangePercentage: market.atl_change_percentage?.usd || 0,
      atlDate: market.atl_date?.usd || '',
      lastUpdated: data.last_updated || new Date().toISOString(),
    };
  }
}
