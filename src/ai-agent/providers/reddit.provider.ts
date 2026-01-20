import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  url: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface RedditSentiment {
  subreddit: string;
  mentions: number;
  averageScore: number;
  averageComments: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 到 100
  hotPosts: RedditPost[];
  discussionTrend: 'rising' | 'stable' | 'declining';
}

@Injectable()
export class RedditProvider {
  private proxyAgent: ProxyAgent | null = null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10分钟缓存

  // 加密货币相关 subreddit
  private readonly CRYPTO_SUBREDDITS = [
    'CryptoCurrency',
    'CryptoMarkets',
    'altcoin',
    'SatoshiStreetBets',
    'CryptoMoonShots',
  ];

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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
   * 搜索特定代币在 Reddit 上的讨论
   */
  async searchTokenDiscussions(
    tokenSymbol: string,
    tokenName?: string
  ): Promise<RedditSentiment> {
    const cacheKey = `reddit:${tokenSymbol.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // 构建搜索查询
      const searchTerms = [tokenSymbol];
      if (tokenName) {
        searchTerms.push(tokenName);
      }

      const allPosts: RedditPost[] = [];

      // 从多个 subreddit 搜索
      for (const subreddit of this.CRYPTO_SUBREDDITS.slice(0, 3)) {
        try {
          const posts = await this.searchSubreddit(subreddit, searchTerms.join(' OR '));
          allPosts.push(...posts);
        } catch (error) {
          console.warn(`[Reddit] 搜索 r/${subreddit} 失败:`, error);
        }

        // 添加延迟避免限流
        await this.delay(500);
      }

      const sentiment = this.analyzeSentiment(tokenSymbol, allPosts);
      this.cache.set(cacheKey, { data: sentiment, timestamp: Date.now() });
      return sentiment;
    } catch (error) {
      console.warn('[Reddit] 搜索讨论失败:', error);
      return this.getDefaultSentiment(tokenSymbol);
    }
  }

  /**
   * 搜索单个 subreddit
   */
  private async searchSubreddit(subreddit: string, query: string): Promise<RedditPost[]> {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=hot&t=day&limit=25`;

    const response = await this.fetchWithProxy(url);

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    const posts = data.data?.children || [];

    return posts.map((post: any) => this.parsePost(post.data));
  }

  /**
   * 获取 subreddit 热门帖子
   */
  async getHotPosts(subreddit: string = 'CryptoCurrency', limit: number = 25): Promise<RedditPost[]> {
    const cacheKey = `hot:${subreddit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
      const response = await this.fetchWithProxy(url);

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json();
      const posts = (data.data?.children || []).map((post: any) => this.parsePost(post.data));

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      return posts;
    } catch (error) {
      console.warn(`[Reddit] 获取 r/${subreddit} 热门帖子失败:`, error);
      return [];
    }
  }

  /**
   * 获取加密货币整体社区情绪
   */
  async getCryptoCommunitySentiment(): Promise<{
    overallSentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
    topDiscussions: RedditPost[];
    trendingCoins: string[];
  }> {
    const cacheKey = 'crypto:community';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const posts = await this.getHotPosts('CryptoCurrency', 50);

      // 分析情绪
      let sentimentScore = 0;
      const coinMentions: Map<string, number> = new Map();

      posts.forEach(post => {
        // 情绪计算
        if (post.sentiment === 'bullish') sentimentScore += post.score;
        else if (post.sentiment === 'bearish') sentimentScore -= post.score;

        // 提取代币提及
        const coins = this.extractCoinMentions(post.title + ' ' + post.selftext);
        coins.forEach(coin => {
          coinMentions.set(coin, (coinMentions.get(coin) || 0) + 1);
        });
      });

      // 归一化
      const totalScore = posts.reduce((sum, p) => sum + Math.abs(p.score), 1);
      const normalizedScore = Math.round((sentimentScore / totalScore) * 100);

      let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (normalizedScore > 15) overallSentiment = 'bullish';
      else if (normalizedScore < -15) overallSentiment = 'bearish';

      // 热门代币
      const trendingCoins = Array.from(coinMentions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([coin]) => coin);

      const result = {
        overallSentiment,
        score: normalizedScore,
        topDiscussions: posts.slice(0, 5),
        trendingCoins,
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.warn('[Reddit] 获取社区情绪失败:', error);
      return {
        overallSentiment: 'neutral',
        score: 0,
        topDiscussions: [],
        trendingCoins: [],
      };
    }
  }

  /**
   * 解析帖子数据
   */
  private parsePost(postData: any): RedditPost {
    const title = postData.title || '';
    const selftext = postData.selftext || '';
    const combinedText = (title + ' ' + selftext).toLowerCase();

    return {
      id: postData.id || '',
      title,
      selftext: selftext.slice(0, 500), // 限制长度
      author: postData.author || 'unknown',
      subreddit: postData.subreddit || '',
      score: postData.score || 0,
      upvoteRatio: postData.upvote_ratio || 0.5,
      numComments: postData.num_comments || 0,
      createdUtc: postData.created_utc || 0,
      url: `https://reddit.com${postData.permalink || ''}`,
      sentiment: this.analyzePostSentiment(combinedText),
    };
  }

  /**
   * 分析帖子情绪
   */
  private analyzePostSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
    const bullishKeywords = [
      'moon', 'bullish', 'pump', 'buy', 'long', 'hodl', 'hold',
      'breakout', 'rally', 'gains', 'ath', 'all time high',
      'undervalued', 'gem', 'promising', 'adoption', '100x', '10x',
      'rocket', '🚀', 'diamond hands', 'to the moon'
    ];

    const bearishKeywords = [
      'dump', 'bearish', 'sell', 'short', 'crash', 'scam', 'rug',
      'ponzi', 'dead', 'avoid', 'warning', 'overvalued',
      'bubble', 'rekt', 'liquidated', 'fear', 'panic',
      'correction', 'dip', 'bear market'
    ];

    let score = 0;
    bullishKeywords.forEach(kw => {
      if (text.includes(kw)) score++;
    });
    bearishKeywords.forEach(kw => {
      if (text.includes(kw)) score--;
    });

    if (score > 2) return 'bullish';
    if (score < -2) return 'bearish';
    return 'neutral';
  }

  /**
   * 分析多个帖子的综合情绪
   */
  private analyzeSentiment(tokenSymbol: string, posts: RedditPost[]): RedditSentiment {
    if (posts.length === 0) {
      return this.getDefaultSentiment(tokenSymbol);
    }

    const totalScore = posts.reduce((sum, p) => sum + p.score, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.numComments, 0);
    const bullishPosts = posts.filter(p => p.sentiment === 'bullish').length;
    const bearishPosts = posts.filter(p => p.sentiment === 'bearish').length;

    // 计算情绪分数
    let sentimentScore = 0;
    posts.forEach(post => {
      const weight = Math.log10(post.score + 10);
      if (post.sentiment === 'bullish') sentimentScore += weight;
      else if (post.sentiment === 'bearish') sentimentScore -= weight;
    });

    const normalizedScore = Math.round(
      (sentimentScore / Math.sqrt(posts.length)) * 20
    );

    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (normalizedScore > 15) sentiment = 'bullish';
    else if (normalizedScore < -15) sentiment = 'bearish';

    // 判断讨论趋势
    const recentPosts = posts.filter(
      p => Date.now() / 1000 - p.createdUtc < 6 * 3600 // 6小时内
    );
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    if (recentPosts.length > posts.length * 0.6) trend = 'rising';
    else if (recentPosts.length < posts.length * 0.2) trend = 'declining';

    return {
      subreddit: 'multiple',
      mentions: posts.length,
      averageScore: Math.round(totalScore / posts.length),
      averageComments: Math.round(totalComments / posts.length),
      sentiment,
      sentimentScore: Math.max(-100, Math.min(100, normalizedScore)),
      hotPosts: posts.sort((a, b) => b.score - a.score).slice(0, 5),
      discussionTrend: trend,
    };
  }

  /**
   * 提取代币提及
   */
  private extractCoinMentions(text: string): string[] {
    const coins: string[] = [];
    const upperText = text.toUpperCase();

    // 常见代币符号
    const knownCoins = [
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
      'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'SHIB',
      'PEPE', 'BONK', 'WIF', 'FLOKI', 'ARB', 'OP'
    ];

    knownCoins.forEach(coin => {
      if (upperText.includes(coin)) {
        coins.push(coin);
      }
    });

    // 检测 $SYMBOL 格式
    const symbolMatches = text.match(/\$([A-Z]{2,10})/g);
    if (symbolMatches) {
      symbolMatches.forEach(match => {
        coins.push(match.replace('$', ''));
      });
    }

    return [...new Set(coins)];
  }

  /**
   * 获取默认情绪
   */
  private getDefaultSentiment(tokenSymbol: string): RedditSentiment {
    return {
      subreddit: 'none',
      mentions: 0,
      averageScore: 0,
      averageComments: 0,
      sentiment: 'neutral',
      sentimentScore: 0,
      hotPosts: [],
      discussionTrend: 'stable',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
