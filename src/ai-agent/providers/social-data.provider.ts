import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

interface TwitterData {
  mentions24h: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  influencerMentions: number;
  engagementRate: number;
}

interface TelegramData {
  memberCount: number;
  messagesLast24h: number;
  activeUsers24h: number;
  growthRate24h: number;
}

@Injectable()
export class SocialDataProvider {
  private twitterCache: Map<string, { data: TwitterData; timestamp: number }> = new Map();
  private telegramCache: Map<string, { data: TelegramData; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  private proxyAgent: ProxyAgent | null = null;

  constructor(private config: ConfigService) {
    const proxyUrl = this.config.get('HTTP_PROXY') || this.config.get('HTTPS_PROXY');
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent(proxyUrl);
      console.log('[SocialDataProvider] 使用代理:', proxyUrl);
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
   * 获取 Twitter 提及数据
   * 支持多种 API 源：RapidAPI Twitter、Nitter 等
   */
  async getTwitterMentions(tokenSymbol: string): Promise<TwitterData> {
    // 检查缓存
    const cached = this.twitterCache.get(tokenSymbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const apiKey = this.config.get('TWITTER_API_KEY');

    if (apiKey) {
      try {
        const data = await this.fetchTwitterFromRapidAPI(tokenSymbol, apiKey);
        this.twitterCache.set(tokenSymbol, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        console.warn('RapidAPI Twitter 失败，尝试备用方案:', error);
      }
    }

    // 备用：使用 CoinGecko 的社交数据
    try {
      const data = await this.fetchSocialFromCoinGecko(tokenSymbol);
      this.twitterCache.set(tokenSymbol, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.warn('CoinGecko 社交数据获取失败:', error);
    }

    // 最终返回默认值
    return { mentions24h: 0, sentiment: 'neutral', influencerMentions: 0, engagementRate: 0 };
  }

  /**
   * 从 RapidAPI 获取 Twitter 数据
   */
  private async fetchTwitterFromRapidAPI(tokenSymbol: string, apiKey: string): Promise<TwitterData> {
    const response = await this.fetchWithProxy(
      `https://twitter-api45.p.rapidapi.com/search.php?query=${encodeURIComponent(tokenSymbol)}&search_type=Latest`,
      {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'twitter-api45.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status}`);
    }

    const data = await response.json();
    const tweets = data.timeline || [];

    // 分析情绪
    const sentiment = this.analyzeSentiment(tweets);

    // 计算参与度
    const totalEngagement = tweets.reduce((sum: number, t: any) => {
      return sum + (t.favorite_count || 0) + (t.retweet_count || 0) * 2;
    }, 0);
    const engagementRate = tweets.length > 0 ? totalEngagement / tweets.length : 0;

    // 识别大V提及（粉丝数 > 10000）
    const influencerTweets = tweets.filter((t: any) =>
      t.user?.followers_count > 10000
    );

    return {
      mentions24h: tweets.length,
      sentiment,
      influencerMentions: influencerTweets.length,
      engagementRate: Math.round(engagementRate),
    };
  }

  /**
   * 从 CoinGecko 获取社交数据（备用方案）
   */
  private async fetchSocialFromCoinGecko(tokenSymbol: string): Promise<TwitterData> {
    // 搜索 coin ID
    const searchResponse = await this.fetchWithProxy(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(tokenSymbol)}`
    );
    const searchData = await searchResponse.json();

    const coin = searchData.coins?.find((c: any) =>
      c.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    );

    if (!coin) {
      return { mentions24h: 0, sentiment: 'neutral', influencerMentions: 0, engagementRate: 0 };
    }

    // 获取详细数据
    const detailResponse = await this.fetchWithProxy(
      `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false`
    );
    const detailData = await detailResponse.json();

    const communityData = detailData.community_data || {};
    const twitterFollowers = communityData.twitter_followers || 0;

    // 估算提及数（基于粉丝数）
    const estimatedMentions = Math.round(twitterFollowers / 1000);

    // 根据市场趋势估算情绪
    const sentiment: 'bullish' | 'bearish' | 'neutral' =
      detailData.sentiment_votes_up_percentage > 60 ? 'bullish' :
      detailData.sentiment_votes_up_percentage < 40 ? 'bearish' : 'neutral';

    return {
      mentions24h: estimatedMentions,
      sentiment,
      influencerMentions: Math.round(estimatedMentions * 0.1),
      engagementRate: Math.round(twitterFollowers / 100),
    };
  }

  /**
   * 情感分析
   */
  private analyzeSentiment(tweets: any[]): 'bullish' | 'bearish' | 'neutral' {
    if (!tweets || tweets.length === 0) return 'neutral';

    const positiveWords = [
      'moon', 'bullish', '🚀', 'buy', 'pump', 'lfg', 'wagmi',
      'gem', 'alpha', 'based', '100x', 'diamond', 'hold', 'hodl',
      'to the moon', 'mooning', 'breakout', 'bullrun'
    ];
    const negativeWords = [
      'dump', 'scam', 'rug', 'bearish', 'sell', 'ngmi',
      'rekt', 'crash', 'fraud', 'ponzi', 'dead', 'avoid',
      'warning', 'rugpull', 'honeypot'
    ];

    let score = 0;
    let totalWeight = 0;

    tweets.forEach(tweet => {
      const text = (tweet.text || tweet.full_text || '').toLowerCase();
      const weight = Math.log10((tweet.user?.followers_count || 100) + 10); // 粉丝权重

      positiveWords.forEach(word => {
        if (text.includes(word)) {
          score += weight;
          totalWeight += weight;
        }
      });
      negativeWords.forEach(word => {
        if (text.includes(word)) {
          score -= weight;
          totalWeight += weight;
        }
      });
    });

    if (totalWeight === 0) return 'neutral';

    const normalizedScore = score / Math.sqrt(totalWeight);

    if (normalizedScore > 2) return 'bullish';
    if (normalizedScore < -2) return 'bearish';
    return 'neutral';
  }

  /**
   * 获取 Telegram 群组数据
   * 支持 Telegram Bot API 和第三方服务
   */
  async getTelegramActivity(channelUsername: string): Promise<TelegramData> {
    // 检查缓存
    const cached = this.telegramCache.get(channelUsername);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const botToken = this.config.get('TELEGRAM_BOT_TOKEN');

    if (botToken) {
      try {
        const data = await this.fetchTelegramFromBotAPI(channelUsername, botToken);
        this.telegramCache.set(channelUsername, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        console.warn('Telegram Bot API 失败:', error);
      }
    }

    // 尝试第三方 Telegram 统计服务
    try {
      const data = await this.fetchTelegramFromTgstat(channelUsername);
      this.telegramCache.set(channelUsername, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.warn('TGStat API 失败:', error);
    }

    // 返回默认值
    return { memberCount: 0, messagesLast24h: 0, activeUsers24h: 0, growthRate24h: 0 };
  }

  /**
   * 从 Telegram Bot API 获取群组数据
   */
  private async fetchTelegramFromBotAPI(channelUsername: string, botToken: string): Promise<TelegramData> {
    // 清理用户名格式
    const cleanUsername = channelUsername.replace('@', '');

    // 获取群组信息
    const chatResponse = await this.fetchWithProxy(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=@${cleanUsername}`
    );
    const chatData = await chatResponse.json();

    if (!chatData.ok) {
      throw new Error(`Telegram API error: ${chatData.description}`);
    }

    // 获取成员数量
    const memberResponse = await this.fetchWithProxy(
      `https://api.telegram.org/bot${botToken}/getChatMemberCount?chat_id=@${cleanUsername}`
    );
    const memberData = await memberResponse.json();

    const memberCount = memberData.ok ? memberData.result : 0;

    // Telegram Bot API 无法直接获取消息统计，使用估算
    // 基于成员数量估算活跃度
    const estimatedMessages = Math.round(memberCount * 0.05); // 5% 活跃率
    const estimatedActiveUsers = Math.round(memberCount * 0.02); // 2% 日活

    return {
      memberCount,
      messagesLast24h: estimatedMessages,
      activeUsers24h: estimatedActiveUsers,
      growthRate24h: 0, // 需要历史数据才能计算
    };
  }

  /**
   * 从 TGStat 获取 Telegram 统计（备用方案）
   */
  private async fetchTelegramFromTgstat(channelUsername: string): Promise<TelegramData> {
    const apiKey = this.config.get('TGSTAT_API_KEY');

    if (!apiKey) {
      throw new Error('TGStat API key not configured');
    }

    const cleanUsername = channelUsername.replace('@', '');

    const response = await this.fetchWithProxy(
      `https://api.tgstat.ru/channels/get?token=${apiKey}&channelId=@${cleanUsername}`
    );

    if (!response.ok) {
      throw new Error(`TGStat API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`TGStat error: ${data.error}`);
    }

    const channel = data.response;

    return {
      memberCount: channel.participants_count || 0,
      messagesLast24h: channel.posts_per_day || 0,
      activeUsers24h: channel.avg_post_reach || 0,
      growthRate24h: channel.daily_growth || 0,
    };
  }

  /**
   * 基于 Token 符号搜索 Telegram 群组
   */
  async findTelegramChannel(tokenSymbol: string): Promise<string | null> {
    // 常见的 Telegram 频道命名模式
    const patterns = [
      `${tokenSymbol.toLowerCase()}official`,
      `${tokenSymbol.toLowerCase()}_official`,
      `${tokenSymbol.toLowerCase()}token`,
      `${tokenSymbol.toLowerCase()}coin`,
      `${tokenSymbol.toLowerCase()}community`,
    ];

    const botToken = this.config.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) return null;

    for (const pattern of patterns) {
      try {
        const response = await this.fetchWithProxy(
          `https://api.telegram.org/bot${botToken}/getChat?chat_id=@${pattern}`
        );
        const data = await response.json();

        if (data.ok) {
          return pattern;
        }
      } catch {
        // 继续尝试下一个模式
      }
    }

    return null;
  }

  /**
   * 汇总社交指标
   */
  async getCommunityMetrics(tokenSymbol: string) {
    const twitter = await this.getTwitterMentions(tokenSymbol);

    // 尝试查找并获取 Telegram 数据
    let telegram: TelegramData | null = null;
    const telegramChannel = await this.findTelegramChannel(tokenSymbol);
    if (telegramChannel) {
      telegram = await this.getTelegramActivity(telegramChannel);
    }

    const socialScore = this.calculateSocialScore(twitter, telegram);

    return {
      twitter,
      telegram,
      socialScore,
    };
  }

  /**
   * 计算综合社交评分 (0-100)
   */
  private calculateSocialScore(twitter: TwitterData, telegram: TelegramData | null): number {
    let score = 0;
    let maxScore = 0;

    // Twitter 评分 (最高 60 分)
    // 提及数评分 (最高 25 分)
    score += Math.min(twitter.mentions24h / 4, 25);
    maxScore += 25;

    // 情绪评分 (最高 20 分)
    if (twitter.sentiment === 'bullish') score += 20;
    else if (twitter.sentiment === 'neutral') score += 10;
    maxScore += 20;

    // 大V提及 (最高 10 分)
    score += Math.min(twitter.influencerMentions * 2, 10);
    maxScore += 10;

    // 参与度评分 (最高 5 分)
    score += Math.min(twitter.engagementRate / 20, 5);
    maxScore += 5;

    // Telegram 评分 (最高 40 分)
    if (telegram) {
      // 成员数 (最高 20 分)
      score += Math.min(Math.log10(telegram.memberCount + 1) * 5, 20);
      maxScore += 20;

      // 消息活跃度 (最高 10 分)
      score += Math.min(telegram.messagesLast24h / 10, 10);
      maxScore += 10;

      // 增长率 (最高 10 分)
      if (telegram.growthRate24h > 0) {
        score += Math.min(telegram.growthRate24h * 10, 10);
      }
      maxScore += 10;
    }

    // 归一化到 0-100
    return Math.round((score / maxScore) * 100);
  }
}
