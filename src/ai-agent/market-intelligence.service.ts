import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinGeckoProvider, CoinGeckoPrice } from './providers/coingecko.provider';
import { CryptoPanicProvider, NewsSentiment } from './providers/cryptopanic.provider';
import { RedditProvider, RedditSentiment } from './providers/reddit.provider';
import { Web3DataProvider } from './providers/web3-data.provider';

/**
 * 综合市场情报数据
 */
export interface MarketIntelligence {
  // 基础信息
  token: {
    address: string;
    symbol: string;
    name: string;
    chain: string;
  };

  // 价格数据 (CoinGecko + DEXScreener)
  price: {
    current: number;
    change24h: number;
    change7d: number;
    change30d: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    marketCap: number;
    rank: number;
    ath: number;
    athChangePercent: number;
    source: 'coingecko' | 'dexscreener';
  };

  // 新闻情绪 (CryptoPanic)
  news: {
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
    count: number;
    positiveCount: number;
    negativeCount: number;
    headlines: string[];
  };

  // 社区热度 (Reddit)
  reddit: {
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
    mentions: number;
    trend: 'rising' | 'stable' | 'declining';
    topDiscussion: string | null;
  };

  // 链上数据 (DEXScreener)
  onChain: {
    txns24h: number;
    holders: number;
    liquidity: number;
    top10HoldingPct: number;
  };

  // 综合评分
  composite: {
    overallSentiment: 'bullish' | 'bearish' | 'neutral';
    confidenceScore: number; // 0-100
    riskLevel: 'low' | 'medium' | 'high';
    signals: string[];
    risks: string[];
  };

  // 元数据
  meta: {
    timestamp: string;
    dataQuality: number; // 数据完整度 0-100
    sources: string[];
  };
}

@Injectable()
export class MarketIntelligenceService {
  constructor(
    private config: ConfigService,
    private coinGecko: CoinGeckoProvider,
    private cryptoPanic: CryptoPanicProvider,
    private reddit: RedditProvider,
    private web3Data: Web3DataProvider,
  ) {}

  /**
   * 获取代币的综合市场情报
   */
  async getTokenIntelligence(
    tokenAddress: string,
    chain: string = 'ethereum'
  ): Promise<MarketIntelligence> {
    console.log('[MarketIntelligence] 开始收集数据...');

    const sources: string[] = [];
    let dataQuality = 0;

    // 1. 获取基础价格数据（DEXScreener 优先）
    let priceData: any = null;
    let tokenSymbol = '';
    let tokenName = '';

    try {
      const dexData = await this.web3Data.getTokenMetrics(tokenAddress);
      priceData = {
        current: dexData.priceUsd,
        change24h: dexData.priceChange24h,
        change7d: 0,
        change30d: 0,
        high24h: dexData.priceUsd * (1 + Math.abs(dexData.priceChange24h) / 100),
        low24h: dexData.priceUsd * (1 - Math.abs(dexData.priceChange24h) / 100),
        volume24h: dexData.volume24h,
        marketCap: dexData.marketCap,
        rank: 0,
        ath: 0,
        athChangePercent: 0,
        source: 'dexscreener' as const,
      };
      tokenSymbol = dexData.symbol;
      tokenName = dexData.name;
      sources.push('dexscreener');
      dataQuality += 30;
      console.log('[MarketIntelligence] DEXScreener 数据获取成功');
    } catch (error) {
      console.warn('[MarketIntelligence] DEXScreener 失败:', error);
    }

    // 2. 尝试从 CoinGecko 补充数据
    if (tokenSymbol) {
      try {
        const cgData = await this.getCoinGeckoData(tokenAddress, tokenSymbol, chain);
        if (cgData) {
          // 合并 CoinGecko 的额外数据
          priceData = {
            ...priceData,
            change7d: cgData.priceChangePercentage7d,
            change30d: cgData.priceChangePercentage30d,
            rank: cgData.marketCapRank,
            ath: cgData.ath,
            athChangePercent: cgData.athChangePercentage,
            // 如果 DEXScreener 数据缺失，用 CoinGecko 补充
            marketCap: priceData?.marketCap || cgData.marketCap,
          };
          sources.push('coingecko');
          dataQuality += 20;
          console.log('[MarketIntelligence] CoinGecko 数据获取成功');
        }
      } catch (error) {
        console.warn('[MarketIntelligence] CoinGecko 失败:', error);
      }
    }

    // 如果没有价格数据，返回错误
    if (!priceData) {
      throw new Error('无法获取代币价格数据');
    }

    // 3. 并行获取情报数据
    const [newsData, redditData, onChainData] = await Promise.all([
      this.getNewsIntelligence(tokenSymbol).catch(e => {
        console.warn('[MarketIntelligence] 新闻数据失败:', e);
        return null;
      }),
      this.getRedditIntelligence(tokenSymbol, tokenName).catch(e => {
        console.warn('[MarketIntelligence] Reddit 数据失败:', e);
        return null;
      }),
      this.getOnChainIntelligence(tokenAddress).catch(e => {
        console.warn('[MarketIntelligence] 链上数据失败:', e);
        return null;
      }),
    ]);

    if (newsData) {
      sources.push('cryptopanic');
      dataQuality += 15;
    }
    if (redditData) {
      sources.push('reddit');
      dataQuality += 15;
    }
    if (onChainData) {
      dataQuality += 20;
    }

    // 4. 计算综合评分
    const composite = this.calculateComposite(priceData, newsData, redditData, onChainData);

    return {
      token: {
        address: tokenAddress,
        symbol: tokenSymbol,
        name: tokenName,
        chain,
      },
      price: priceData,
      news: newsData || {
        sentiment: 'neutral',
        score: 0,
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        headlines: [],
      },
      reddit: redditData || {
        sentiment: 'neutral',
        score: 0,
        mentions: 0,
        trend: 'stable',
        topDiscussion: null,
      },
      onChain: onChainData || {
        txns24h: 0,
        holders: 0,
        liquidity: 0,
        top10HoldingPct: 0,
      },
      composite,
      meta: {
        timestamp: new Date().toISOString(),
        dataQuality,
        sources,
      },
    };
  }

  /**
   * 从 CoinGecko 获取数据
   */
  private async getCoinGeckoData(
    tokenAddress: string,
    symbol: string,
    chain: string
  ): Promise<CoinGeckoPrice | null> {
    // 首先尝试通过合约地址查询
    const platformMap: Record<string, string> = {
      ethereum: 'ethereum',
      eth: 'ethereum',
      bsc: 'binance-smart-chain',
      solana: 'solana',
      base: 'base',
      arbitrum: 'arbitrum-one',
      polygon: 'polygon-pos',
    };

    const platform = platformMap[chain.toLowerCase()] || 'ethereum';

    let data = await this.coinGecko.getTokenByContract(tokenAddress, platform);

    // 如果合约查询失败，尝试通过符号搜索
    if (!data) {
      const searchResults = await this.coinGecko.searchToken(symbol);
      if (searchResults.length > 0) {
        data = await this.coinGecko.getTokenMarketData(searchResults[0].id);
      }
    }

    return data;
  }

  /**
   * 获取新闻情报
   */
  private async getNewsIntelligence(symbol: string): Promise<MarketIntelligence['news']> {
    const news = await this.cryptoPanic.getTokenNews(symbol);

    return {
      sentiment: news.overall,
      score: news.score,
      count: news.newsCount,
      positiveCount: news.positiveCount,
      negativeCount: news.negativeCount,
      headlines: news.topNews.slice(0, 3).map(n => n.title),
    };
  }

  /**
   * 获取 Reddit 情报
   */
  private async getRedditIntelligence(
    symbol: string,
    name: string
  ): Promise<MarketIntelligence['reddit']> {
    const reddit = await this.reddit.searchTokenDiscussions(symbol, name);

    return {
      sentiment: reddit.sentiment,
      score: reddit.sentimentScore,
      mentions: reddit.mentions,
      trend: reddit.discussionTrend,
      topDiscussion: reddit.hotPosts[0]?.title || null,
    };
  }

  /**
   * 获取链上数据情报
   */
  private async getOnChainIntelligence(tokenAddress: string): Promise<MarketIntelligence['onChain']> {
    const [holderData, activityData] = await Promise.all([
      this.web3Data.getHolderData(tokenAddress),
      this.web3Data.getOnChainActivity(tokenAddress),
    ]);

    // 从 DEXScreener 获取更多数据
    let txns24h = 0;
    let liquidity = 0;

    try {
      const metrics = await this.web3Data.getTokenMetrics(tokenAddress);
      txns24h = metrics.txns24h;
      liquidity = metrics.liquidity;
    } catch {
      // 忽略
    }

    return {
      txns24h,
      holders: holderData.holderCount,
      liquidity,
      top10HoldingPct: holderData.top10HoldingPct,
    };
  }

  /**
   * 计算综合评分和信号
   */
  private calculateComposite(
    price: MarketIntelligence['price'],
    news: MarketIntelligence['news'] | null,
    reddit: MarketIntelligence['reddit'] | null,
    onChain: MarketIntelligence['onChain'] | null
  ): MarketIntelligence['composite'] {
    const signals: string[] = [];
    const risks: string[] = [];
    let sentimentScore = 0;
    let weightTotal = 0;

    // 价格信号分析 (权重: 30%)
    if (price.change24h > 10) {
      signals.push('24h涨幅强劲 (+' + price.change24h.toFixed(1) + '%)');
      sentimentScore += 30;
    } else if (price.change24h < -10) {
      risks.push('24h跌幅明显 (' + price.change24h.toFixed(1) + '%)');
      sentimentScore -= 30;
    }
    weightTotal += 30;

    if (price.change7d > 20) {
      signals.push('周涨幅优异');
      sentimentScore += 10;
    } else if (price.change7d < -20) {
      risks.push('周跌幅较大');
      sentimentScore -= 10;
    }

    // 交易量分析
    if (price.volume24h > price.marketCap * 0.1) {
      signals.push('交易活跃度高');
      sentimentScore += 10;
    }

    // 新闻情绪分析 (权重: 25%)
    if (news) {
      if (news.sentiment === 'bullish') {
        signals.push('新闻情绪积极');
        sentimentScore += 25;
      } else if (news.sentiment === 'bearish') {
        risks.push('新闻情绪消极');
        sentimentScore -= 25;
      }
      weightTotal += 25;
    }

    // Reddit 社区分析 (权重: 20%)
    if (reddit) {
      if (reddit.sentiment === 'bullish' && reddit.mentions > 5) {
        signals.push('Reddit 社区看好');
        sentimentScore += 20;
      } else if (reddit.sentiment === 'bearish') {
        risks.push('Reddit 社区看衰');
        sentimentScore -= 20;
      }

      if (reddit.trend === 'rising') {
        signals.push('社区讨论热度上升');
        sentimentScore += 5;
      }
      weightTotal += 20;
    }

    // 链上数据分析 (权重: 25%)
    if (onChain) {
      if (onChain.top10HoldingPct > 50) {
        risks.push('代币集中度高 (前10持有' + onChain.top10HoldingPct.toFixed(0) + '%)');
        sentimentScore -= 15;
      } else if (onChain.top10HoldingPct < 30 && onChain.holders > 100) {
        signals.push('代币分布健康');
        sentimentScore += 10;
      }

      if (onChain.liquidity < 50000) {
        risks.push('流动性不足 ($' + (onChain.liquidity / 1000).toFixed(0) + 'K)');
        sentimentScore -= 10;
      } else if (onChain.liquidity > 500000) {
        signals.push('流动性充足');
        sentimentScore += 10;
      }

      if (onChain.txns24h > 1000) {
        signals.push('链上交易活跃');
        sentimentScore += 5;
      }
      weightTotal += 25;
    }

    // 计算归一化分数
    const normalizedScore = weightTotal > 0
      ? Math.round((sentimentScore / weightTotal) * 100)
      : 0;

    // 确定整体情绪
    let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (normalizedScore > 20) overallSentiment = 'bullish';
    else if (normalizedScore < -20) overallSentiment = 'bearish';

    // 计算信心分数 (基于数据完整度和信号强度)
    const signalStrength = Math.abs(normalizedScore);
    const confidenceScore = Math.min(100, Math.round(
      signalStrength * 0.6 + (signals.length + risks.length) * 5
    ));

    // 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    if (risks.length >= 3 || onChain?.liquidity as number < 30000) {
      riskLevel = 'high';
    } else if (risks.length <= 1 && signals.length >= 3) {
      riskLevel = 'low';
    }

    return {
      overallSentiment,
      confidenceScore,
      riskLevel,
      signals,
      risks,
    };
  }

  /**
   * 获取市场整体情报
   */
  async getMarketOverview(): Promise<{
    globalSentiment: 'bullish' | 'bearish' | 'neutral';
    fearGreedIndex: number;
    trendingTopics: string[];
    marketCap: number;
    volume24h: number;
    btcDominance: number;
  }> {
    const [global, news, reddit] = await Promise.all([
      this.coinGecko.getGlobalMarketData(),
      this.cryptoPanic.getMarketSentiment(),
      this.reddit.getCryptoCommunitySentiment(),
    ]);

    // 综合计算市场情绪
    let sentimentScore = 0;
    if (news.overall === 'bullish') sentimentScore += 1;
    else if (news.overall === 'bearish') sentimentScore -= 1;

    if (reddit.overallSentiment === 'bullish') sentimentScore += 1;
    else if (reddit.overallSentiment === 'bearish') sentimentScore -= 1;

    if (global && global.marketCapChange24h > 2) sentimentScore += 1;
    else if (global && global.marketCapChange24h < -2) sentimentScore -= 1;

    let globalSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (sentimentScore >= 2) globalSentiment = 'bullish';
    else if (sentimentScore <= -2) globalSentiment = 'bearish';

    return {
      globalSentiment,
      fearGreedIndex: 50 + news.score / 2, // 转换为 0-100
      trendingTopics: reddit.trendingCoins,
      marketCap: global?.totalMarketCap || 0,
      volume24h: global?.totalVolume || 0,
      btcDominance: global?.btcDominance || 0,
    };
  }
}
