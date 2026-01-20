import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  votes: {
    positive: number;
    negative: number;
    important: number;
    liked: number;
    disliked: number;
  };
  currencies: string[];
}

export interface NewsSentiment {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 到 100
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  topNews: NewsItem[];
}

@Injectable()
export class CryptoPanicProvider {
  private readonly BASE_URL = 'https://cryptopanic.com/api/v1';
  private proxyAgent: ProxyAgent | null = null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

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

    return undiciFetch(url, fetchOptions) as unknown as Response;
  }

  /**
   * 获取特定代币的新闻和情绪
   */
  async getTokenNews(currency: string, limit: number = 20): Promise<NewsSentiment> {
    const cacheKey = `news:${currency.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const apiKey = this.config.get('CRYPTOPANIC_API_KEY');

    try {
      let url: string;
      if (apiKey) {
        // 有 API Key，使用官方 API
        url = `${this.BASE_URL}/posts/?auth_token=${apiKey}&currencies=${currency}&filter=hot&public=true`;
      } else {
        // 无 API Key，使用公开端点（限制较多）
        url = `${this.BASE_URL}/posts/?currencies=${currency}&filter=hot&public=true`;
      }

      const response = await this.fetchWithProxy(url);

      if (!response.ok) {
        // 如果官方 API 失败，尝试备用方案
        return await this.getFallbackSentiment(currency);
      }

      const data = await response.json();
      const news = this.parseNewsResults(data.results || []);
      const sentiment = this.calculateSentiment(news);

      this.cache.set(cacheKey, { data: sentiment, timestamp: Date.now() });
      return sentiment;
    } catch (error) {
      console.warn('[CryptoPanic] 获取新闻失败:', error);
      return await this.getFallbackSentiment(currency);
    }
  }

  /**
   * 获取整体市场新闻情绪
   */
  async getMarketSentiment(): Promise<NewsSentiment> {
    const cacheKey = 'market:sentiment';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const apiKey = this.config.get('CRYPTOPANIC_API_KEY');

    try {
      let url: string;
      if (apiKey) {
        url = `${this.BASE_URL}/posts/?auth_token=${apiKey}&filter=hot&public=true`;
      } else {
        url = `${this.BASE_URL}/posts/?filter=hot&public=true`;
      }

      const response = await this.fetchWithProxy(url);

      if (!response.ok) {
        return this.getDefaultSentiment();
      }

      const data = await response.json();
      const news = this.parseNewsResults(data.results || []);
      const sentiment = this.calculateSentiment(news);

      this.cache.set(cacheKey, { data: sentiment, timestamp: Date.now() });
      return sentiment;
    } catch (error) {
      console.warn('[CryptoPanic] 获取市场情绪失败:', error);
      return this.getDefaultSentiment();
    }
  }

  /**
   * 解析新闻结果
   */
  private parseNewsResults(results: any[]): NewsItem[] {
    return results.map((item: any) => {
      // 基于投票计算情绪
      const positiveVotes = (item.votes?.positive || 0) + (item.votes?.liked || 0);
      const negativeVotes = (item.votes?.negative || 0) + (item.votes?.disliked || 0);

      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (positiveVotes > negativeVotes * 1.5) {
        sentiment = 'positive';
      } else if (negativeVotes > positiveVotes * 1.5) {
        sentiment = 'negative';
      }

      // 基于标题关键词增强情绪判断
      const title = (item.title || '').toLowerCase();
      if (this.containsBullishKeywords(title)) {
        sentiment = 'positive';
      } else if (this.containsBearishKeywords(title)) {
        sentiment = 'negative';
      }

      return {
        id: item.id?.toString() || '',
        title: item.title || '',
        url: item.url || '',
        source: item.source?.title || 'Unknown',
        publishedAt: item.published_at || new Date().toISOString(),
        sentiment,
        votes: {
          positive: item.votes?.positive || 0,
          negative: item.votes?.negative || 0,
          important: item.votes?.important || 0,
          liked: item.votes?.liked || 0,
          disliked: item.votes?.disliked || 0,
        },
        currencies: (item.currencies || []).map((c: any) => c.code),
      };
    });
  }

  /**
   * 计算综合情绪
   */
  private calculateSentiment(news: NewsItem[]): NewsSentiment {
    if (news.length === 0) {
      return this.getDefaultSentiment();
    }

    const positiveNews = news.filter(n => n.sentiment === 'positive');
    const negativeNews = news.filter(n => n.sentiment === 'negative');

    // 计算加权分数（考虑投票权重）
    let totalScore = 0;
    let totalWeight = 0;

    news.forEach(item => {
      const weight = 1 + Math.log10(
        item.votes.positive + item.votes.negative + item.votes.important + 1
      );
      const itemScore = item.sentiment === 'positive' ? 1 :
                        item.sentiment === 'negative' ? -1 : 0;
      totalScore += itemScore * weight;
      totalWeight += weight;
    });

    const normalizedScore = totalWeight > 0
      ? Math.round((totalScore / totalWeight) * 100)
      : 0;

    let overall: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (normalizedScore > 20) {
      overall = 'bullish';
    } else if (normalizedScore < -20) {
      overall = 'bearish';
    }

    return {
      overall,
      score: normalizedScore,
      newsCount: news.length,
      positiveCount: positiveNews.length,
      negativeCount: negativeNews.length,
      topNews: news.slice(0, 5),
    };
  }

  /**
   * 检查是否包含看涨关键词
   */
  private containsBullishKeywords(text: string): boolean {
    const keywords = [
      'surge', 'soar', 'rally', 'breakout', 'bullish', 'pump',
      'all-time high', 'ath', 'moon', 'rocket', 'gains',
      'adoption', 'partnership', 'launch', 'upgrade',
      'institutional', 'etf approved', 'whale buy'
    ];
    return keywords.some(kw => text.includes(kw));
  }

  /**
   * 检查是否包含看跌关键词
   */
  private containsBearishKeywords(text: string): boolean {
    const keywords = [
      'crash', 'dump', 'plunge', 'bearish', 'sell-off',
      'hack', 'scam', 'rug', 'fraud', 'sec', 'lawsuit',
      'ban', 'regulation', 'crackdown', 'warning',
      'whale sell', 'liquidation', 'fear'
    ];
    return keywords.some(kw => text.includes(kw));
  }

  /**
   * 备用情绪获取（基于其他来源）
   */
  private async getFallbackSentiment(currency: string): Promise<NewsSentiment> {
    // 尝试从 Alternative.me Fear & Greed Index 获取
    try {
      const response = await this.fetchWithProxy(
        'https://api.alternative.me/fng/?limit=1'
      );

      if (response.ok) {
        const data = await response.json();
        const fngValue = parseInt(data.data?.[0]?.value || '50', 10);

        let overall: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (fngValue > 60) {
          overall = 'bullish';
        } else if (fngValue < 40) {
          overall = 'bearish';
        }

        return {
          overall,
          score: fngValue - 50, // 转换为 -50 到 50 的范围
          newsCount: 0,
          positiveCount: 0,
          negativeCount: 0,
          topNews: [],
        };
      }
    } catch (error) {
      console.warn('[CryptoPanic] Fear & Greed 备用方案失败:', error);
    }

    return this.getDefaultSentiment();
  }

  /**
   * 获取默认情绪值
   */
  private getDefaultSentiment(): NewsSentiment {
    return {
      overall: 'neutral',
      score: 0,
      newsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      topNews: [],
    };
  }
}
