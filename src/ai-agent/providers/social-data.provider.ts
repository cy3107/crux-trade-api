import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

interface TelegramData {
  memberCount: number;
  messagesLast24h: number;
  activeUsers24h: number;
  growthRate24h: number;
}

@Injectable()
export class SocialDataProvider {
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
   * 汇总社交指标（仅 Telegram）
   */
  async getCommunityMetrics(tokenSymbol: string) {
    // 尝试查找并获取 Telegram 数据
    let telegram: TelegramData | null = null;
    const telegramChannel = await this.findTelegramChannel(tokenSymbol);
    if (telegramChannel) {
      telegram = await this.getTelegramActivity(telegramChannel);
    }

    const socialScore = this.calculateSocialScore(telegram);

    return {
      telegram,
      socialScore,
    };
  }

  /**
   * 计算综合社交评分 (0-100)
   * 目前仅基于 Telegram 数据
   */
  private calculateSocialScore(telegram: TelegramData | null): number {
    if (!telegram) {
      return 50; // 无数据时返回中性值
    }

    let score = 0;
    let maxScore = 0;

    // Telegram 评分 (最高 100 分)
    // 成员数 (最高 40 分)
    score += Math.min(Math.log10(telegram.memberCount + 1) * 10, 40);
    maxScore += 40;

    // 消息活跃度 (最高 30 分)
    score += Math.min(telegram.messagesLast24h / 10, 30);
    maxScore += 30;

    // 活跃用户 (最高 20 分)
    score += Math.min(Math.log10(telegram.activeUsers24h + 1) * 5, 20);
    maxScore += 20;

    // 增长率 (最高 10 分)
    if (telegram.growthRate24h > 0) {
      score += Math.min(telegram.growthRate24h * 10, 10);
    }
    maxScore += 10;

    // 归一化到 0-100
    return Math.round((score / maxScore) * 100);
  }
}
