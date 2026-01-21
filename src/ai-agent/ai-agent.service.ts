import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { Web3DataProvider } from './providers/web3-data.provider';
import { SocialDataProvider } from './providers/social-data.provider';
import { AiEngineService } from './ai-engine.service';
import { MarketIntelligenceService, MarketIntelligence } from './market-intelligence.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { StreamEvent } from './dto/chat-input.dto';

/**
 * 输入验证结果
 */
export interface InputValidation {
  valid: boolean;
  type: 'token_address' | 'hot_query' | 'help_query' | 'invalid';
  tokenAddress?: string;
  chain?: string;
  reason?: string;
}

@Injectable()
export class AiAgentService {
  private proxyAgent: ProxyAgent | null = null;

  constructor(
    private web3Data: Web3DataProvider,
    private socialData: SocialDataProvider,
    private aiEngine: AiEngineService,
    private marketIntelligence: MarketIntelligenceService,
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {
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
   * 核心方法: 分析 meme 币 (增强版 - 使用多数据源)
   */
  async analyzeMeme(tokenAddress: string, chain: string = 'ethereum') {
    try {
      // 1. 获取综合市场情报
      console.log('收集市场情报中...');
      const intelligence = await this.marketIntelligence.getTokenIntelligence(tokenAddress, chain);

      // 2. 构建 AI 分析所需的数据
      const collectedData = this.buildAnalysisData(intelligence);

      // 3. AI 分析阶段
      console.log('AI 分析中...');
      let prediction;
      try {
        prediction = await this.aiEngine.predictMemePriceEnhanced(collectedData, intelligence);
      } catch (error) {
        console.log('AI 分析失败，使用规则引擎:', error);
        prediction = this.buildPredictionFromIntelligence(intelligence);
      }

      // 4. 保存结果（异步，不阻塞返回）
      this.savePredictionEnhanced(tokenAddress, prediction, intelligence).catch(err => {
        console.error('保存预测失败:', err);
      });

      // 5. 返回完整报告
      return {
        token: intelligence.token,
        currentPrice: intelligence.price.current,
        prediction,
        dataSnapshot: {
          market: {
            symbol: intelligence.token.symbol,
            name: intelligence.token.name,
            priceUsd: intelligence.price.current,
            volume24h: intelligence.price.volume24h,
            liquidity: intelligence.onChain.liquidity,
            priceChange24h: intelligence.price.change24h,
            txns24h: intelligence.onChain.txns24h,
            marketCap: intelligence.price.marketCap,
          },
          social: this.calculateSocialScore(intelligence),
          timestamp: intelligence.meta.timestamp,
        },
        // 新增: 详细情报数据
        intelligence: {
          news: intelligence.news,
          reddit: intelligence.reddit,
          onChain: intelligence.onChain,
          composite: intelligence.composite,
          dataQuality: intelligence.meta.dataQuality,
          sources: intelligence.meta.sources,
        },
        // Token 使用统计
        tokenUsage: prediction.tokenUsage || null,
      };
    } catch (error) {
      console.error('分析失败:', error);
      throw new Error(`分析 ${tokenAddress} 失败: ${error.message}`);
    }
  }

  /**
   * 旧版分析方法 (仅使用 DEXScreener，用于快速分析)
   */
  async analyzeMemeQuick(tokenAddress: string, chain: string = 'ethereum') {
    try {
      console.log('快速分析中...');
      const market = await this.web3Data.getTokenMetrics(tokenAddress);
      const onChain = await this.web3Data.getHolderData(tokenAddress);

      const collectedData = {
        market,
        onChain,
        social: { socialScore: 50 },
      };

      let prediction;
      try {
        prediction = await this.aiEngine.predictMemePrice(collectedData);
      } catch (error) {
        console.log('AI 分析失败，使用备用规则引擎');
        prediction = await this.aiEngine.fallbackPrediction(collectedData);
      }

      this.savePrediction(tokenAddress, prediction, collectedData).catch(err => {
        console.error('保存预测失败:', err);
      });

      return {
        token: {
          address: tokenAddress,
          symbol: market.symbol,
          name: market.name,
        },
        currentPrice: market.priceUsd,
        prediction,
        dataSnapshot: {
          market,
          social: 50,
          timestamp: new Date().toISOString(),
        },
        // Token 使用统计
        tokenUsage: prediction.tokenUsage || null,
      };
    } catch (error) {
      console.error('快速分析失败:', error);
      throw new Error(`分析 ${tokenAddress} 失败: ${error.message}`);
    }
  }

  /**
   * 构建分析数据
   */
  private buildAnalysisData(intel: MarketIntelligence) {
    return {
      market: {
        symbol: intel.token.symbol,
        name: intel.token.name,
        priceUsd: intel.price.current,
        volume24h: intel.price.volume24h,
        liquidity: intel.onChain.liquidity,
        priceChange24h: intel.price.change24h,
        priceChange7d: intel.price.change7d,
        priceChange30d: intel.price.change30d,
        txns24h: intel.onChain.txns24h,
        marketCap: intel.price.marketCap,
        rank: intel.price.rank,
        ath: intel.price.ath,
        athChangePercent: intel.price.athChangePercent,
      },
      onChain: {
        holderCount: intel.onChain.holders,
        top10HoldingPct: intel.onChain.top10HoldingPct,
        whaleAddresses: [],
      },
      social: {
        socialScore: this.calculateSocialScore(intel),
        reddit: intel.reddit,
      },
      news: intel.news,
      composite: intel.composite,
    };
  }

  /**
   * 计算社交综合评分
   */
  private calculateSocialScore(intel: MarketIntelligence): number {
    let score = 0;
    let weights = 0;

    // 新闻情绪 (权重 45%)
    if (intel.news.count > 0) {
      score += (intel.news.score + 100) / 2 * 0.45;
      weights += 0.45;
    }

    // Reddit 情绪 (权重 55%)
    if (intel.reddit.mentions > 0) {
      score += (intel.reddit.score + 100) / 2 * 0.55;
      weights += 0.55;
    }

    // 如果没有任何社交数据，返回中性值
    if (weights === 0) return 50;

    return Math.round(score / weights);
  }

  /**
   * 基于情报数据构建预测 (备用方案)
   */
  private buildPredictionFromIntelligence(intel: MarketIntelligence) {
    const composite = intel.composite;

    // 基于综合情绪计算预测
    let priceTarget = intel.price.current;
    if (composite.overallSentiment === 'bullish') {
      priceTarget *= 1 + (composite.confidenceScore / 500); // 最高 +20%
    } else if (composite.overallSentiment === 'bearish') {
      priceTarget *= 1 - (composite.confidenceScore / 500); // 最高 -20%
    }

    return {
      prediction: composite.overallSentiment,
      confidence: composite.confidenceScore,
      priceTarget24h: priceTarget,
      signals: composite.signals,
      risks: composite.risks,
      reasoning: `基于 ${intel.meta.sources.join(', ')} 数据综合分析`,
    };
  }

  /**
   * 保存增强版预测结果
   */
  private async savePredictionEnhanced(
    tokenAddress: string,
    prediction: any,
    intelligence: MarketIntelligence,
  ) {
    try {
      await this.supabase.getClient().from('ai_predictions').insert({
        token_address: tokenAddress,
        prediction: prediction.prediction,
        confidence: prediction.confidence,
        price_target_24h: prediction.priceTarget24h,
        current_price: intelligence.price.current,
        signals: prediction.signals,
        risks: prediction.risks,
        raw_data: {
          intelligence: {
            price: intelligence.price,
            news: intelligence.news,
            reddit: intelligence.reddit,
            onChain: intelligence.onChain,
            composite: intelligence.composite,
          },
          meta: intelligence.meta,
        },
        created_at: new Date().toISOString(),
        verified_at: null,
        actual_result: null,
      });
    } catch (error) {
      console.error('保存预测失败:', error);
    }
  }

  /**
   * 保存预测结果到数据库
   */
  private async savePrediction(
    tokenAddress: string,
    prediction: any,
    data: any,
  ) {
    try {
      await this.supabase.getClient().from('ai_predictions').insert({
        token_address: tokenAddress,
        prediction: prediction.prediction,
        confidence: prediction.confidence,
        price_target_24h: prediction.priceTarget24h,
        current_price: data.market.priceUsd,
        signals: prediction.signals,
        risks: prediction.risks,
        raw_data: data,
        created_at: new Date().toISOString(),
        verified_at: null,
        actual_result: null,
      });
    } catch (error) {
      console.error('保存预测失败:', error);
    }
  }

  /**
   * 获取热门 meme 币列表
   */
  async getHotMemeTokens(limit: number = 10) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await this.fetchWithProxy(
          'https://api.dexscreener.com/latest/dex/search?q=meme',
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.pairs || !Array.isArray(data.pairs)) {
          return [];
        }

        return data.pairs
          .filter((p: any) => p.volume?.h24 > 10000)
          .slice(0, limit)
          .map((p: any) => ({
            address: p.baseToken.address,
            symbol: p.baseToken.symbol,
            name: p.baseToken.name,
            priceUsd: p.priceUsd,
            volume24h: p.volume?.h24 || 0,
            priceChange24h: p.priceChange?.h24 || 0,
            liquidity: p.liquidity?.usd || 0,
          }));
      } catch (error) {
        console.warn(`[HotMemes] 第 ${attempt} 次请求失败:`, error instanceof Error ? error.message : error);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    console.error('获取热门币失败: 重试次数已用尽');
    return [];
  }

  /**
   * 获取历史预测记录
   */
  async getPredictionHistory(limit: number = 20) {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('ai_predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('查询历史预测失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('获取历史预测失败:', error);
      return [];
    }
  }

  /**
   * 验证历史预测准确率
   */
  async validatePrediction(predictionId: string) {
    try {
      // 获取预测记录
      const { data: prediction, error } = await this.supabase
        .getClient()
        .from('ai_predictions')
        .select('*')
        .eq('id', predictionId)
        .single();

      if (error || !prediction) {
        throw new Error('预测记录不存在');
      }

      // 获取当前价格
      const currentData = await this.web3Data.getTokenMetrics(prediction.token_address);
      const actualPrice = currentData.priceUsd;
      const predictedPrice = prediction.price_target_24h;
      const originalPrice = prediction.current_price;

      // 计算准确率
      const predictedChange = (predictedPrice - originalPrice) / originalPrice;
      const actualChange = (actualPrice - originalPrice) / originalPrice;

      // 判断预测方向是否正确
      const directionCorrect =
        (predictedChange > 0 && actualChange > 0) ||
        (predictedChange < 0 && actualChange < 0) ||
        (predictedChange === 0 && Math.abs(actualChange) < 0.05);

      // 计算误差
      const accuracyScore = directionCorrect
        ? Math.max(0, 100 - Math.abs(predictedChange - actualChange) * 100)
        : 0;

      // 更新记录
      await this.supabase.getClient()
        .from('ai_predictions')
        .update({
          verified_at: new Date().toISOString(),
          actual_price_24h: actualPrice,
          actual_result: directionCorrect ? 'correct' : 'incorrect',
          accuracy_score: Math.round(accuracyScore),
        })
        .eq('id', predictionId);

      return {
        predictionId,
        originalPrice,
        predictedPrice,
        actualPrice,
        directionCorrect,
        accuracyScore: Math.round(accuracyScore),
      };
    } catch (error) {
      console.error('验证预测失败:', error);
      throw error;
    }
  }

  /**
   * 验证用户输入是否合法
   */
  validateInput(input: string): InputValidation {
    const trimmedInput = input.trim();

    // 1. 检查是否为 Token 地址
    // Ethereum/BSC/Base 地址格式
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmedInput)) {
      return {
        valid: true,
        type: 'token_address',
        tokenAddress: trimmedInput,
        chain: 'ethereum',
      };
    }

    // Solana 地址格式
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedInput)) {
      return {
        valid: true,
        type: 'token_address',
        tokenAddress: trimmedInput,
        chain: 'solana',
      };
    }

    const lowerInput = trimmedInput.toLowerCase();

    // 2. 检查是否为热门查询
    const hotKeywords = ['hot', 'trending', 'popular', '热门', '火热', 'top', 'best'];
    if (hotKeywords.some(k => lowerInput.includes(k))) {
      return {
        valid: true,
        type: 'hot_query',
      };
    }

    // 3. 检查是否为帮助查询
    const helpKeywords = ['help', '帮助', 'how', '怎么', '如何', 'what', '什么'];
    if (helpKeywords.some(k => lowerInput.includes(k))) {
      return {
        valid: true,
        type: 'help_query',
      };
    }

    // 4. 检查是否与 crypto/web3/meme 币相关
    const cryptoKeywords = [
      'meme', 'token', 'coin', 'crypto', 'defi', 'nft', 'web3',
      'eth', 'btc', 'sol', 'bnb', 'doge', 'shib', 'pepe',
      '代币', '币', '加密', '区块链', 'blockchain',
      'pump', 'dump', 'moon', 'rug', 'dex', 'swap',
      'price', 'market', 'trade', '价格', '市场', '交易',
      'analyze', 'analysis', 'predict', '分析', '预测',
    ];

    const isCryptoRelated = cryptoKeywords.some(k => lowerInput.includes(k));

    if (isCryptoRelated) {
      // 虽然相关但不是有效的地址，提示用户输入地址
      return {
        valid: false,
        type: 'invalid',
        reason: '请输入有效的 Token 合约地址进行分析，或输入 "hot" 查看热门 meme 币',
      };
    }

    // 5. 不相关的查询 - 拒绝回答
    return {
      valid: false,
      type: 'invalid',
      reason: '抱歉，我是 Meme 币分析助手，只能回答与加密货币和 Web3 相关的问题。请输入 Token 地址进行分析，或输入 "hot" 查看热门 meme 币。',
    };
  }

  /**
   * 流式分析 meme 币
   */
  async *analyzeMemeStreaming(
    tokenAddress: string,
    chain: string = 'ethereum',
  ): AsyncGenerator<StreamEvent> {
    try {
      // 阶段 1: 验证输入
      yield {
        type: 'progress',
        data: {
          stage: 'validating',
          progress: 5,
          message: '验证 Token 地址...',
        },
      };

      await this.delay(300);

      // 阶段 2: 获取价格数据
      yield {
        type: 'progress',
        data: {
          stage: 'fetching_price',
          progress: 15,
          message: '获取价格数据 (DEXScreener)...',
        },
      };

      let intelligence: MarketIntelligence;
      try {
        // 开始获取市场情报
        yield {
          type: 'progress',
          data: {
            stage: 'fetching_market',
            progress: 25,
            message: '收集市场情报中...',
          },
        };

        intelligence = await this.marketIntelligence.getTokenIntelligence(tokenAddress, chain);

        yield {
          type: 'content',
          data: {
            content: `📊 **${intelligence.token.symbol}** (${intelligence.token.name})\n`,
          },
        };

        yield {
          type: 'content',
          data: {
            content: `当前价格: $${intelligence.price.current.toFixed(8)}\n`,
          },
        };

      } catch (error) {
        yield {
          type: 'error',
          data: {
            error: `获取 Token 数据失败: ${error.message}`,
          },
        };
        return;
      }

      // 阶段 3: 获取新闻数据
      yield {
        type: 'progress',
        data: {
          stage: 'fetching_news',
          progress: 40,
          message: '分析新闻情绪 (CryptoPanic)...',
        },
      };

      await this.delay(200);

      if (intelligence.news.count > 0) {
        yield {
          type: 'content',
          data: {
            content: `\n📰 **新闻情绪:** ${intelligence.news.sentiment} (${intelligence.news.count} 条相关新闻)\n`,
          },
        };
      }

      // 阶段 4: 获取社区数据
      yield {
        type: 'progress',
        data: {
          stage: 'fetching_social',
          progress: 55,
          message: '分析社区热度 (Reddit)...',
        },
      };

      await this.delay(200);

      if (intelligence.reddit.mentions > 0) {
        yield {
          type: 'content',
          data: {
            content: `💬 **Reddit 讨论:** ${intelligence.reddit.mentions} 条提及，情绪${intelligence.reddit.sentiment === 'bullish' ? '积极' : intelligence.reddit.sentiment === 'bearish' ? '消极' : '中性'}\n`,
          },
        };
      }

      // 阶段 5: 链上数据分析
      yield {
        type: 'progress',
        data: {
          stage: 'analyzing_onchain',
          progress: 70,
          message: '分析链上数据...',
        },
      };

      await this.delay(200);

      yield {
        type: 'content',
        data: {
          content: `\n⛓️ **链上数据:**\n• 流动性: $${intelligence.onChain.liquidity.toLocaleString()}\n• 24h 交易数: ${intelligence.onChain.txns24h}\n• 持有者: ${intelligence.onChain.holders}\n`,
        },
      };

      // 阶段 6: AI 分析
      yield {
        type: 'progress',
        data: {
          stage: 'ai_analysis',
          progress: 85,
          message: '🤖 AI 深度分析中...',
        },
      };

      const collectedData = this.buildAnalysisData(intelligence);
      let prediction;

      try {
        prediction = await this.aiEngine.predictMemePriceEnhanced(collectedData, intelligence);
      } catch (error) {
        console.log('AI 分析失败，使用规则引擎:', error);
        prediction = this.buildPredictionFromIntelligence(intelligence);
      }

      // 阶段 7: 输出预测结果
      yield {
        type: 'progress',
        data: {
          stage: 'generating_report',
          progress: 95,
          message: '生成分析报告...',
        },
      };

      const predictionEmoji = {
        bullish: '📈',
        bearish: '📉',
        neutral: '➡️',
      };

      const predictionText = {
        bullish: '看多 (Bullish)',
        bearish: '看空 (Bearish)',
        neutral: '中性 (Neutral)',
      };

      yield {
        type: 'content',
        data: {
          content: `\n${predictionEmoji[prediction.prediction]} **预测: ${predictionText[prediction.prediction]}**\n`,
        },
      };

      yield {
        type: 'content',
        data: {
          content: `**信心度:** ${prediction.confidence}%\n`,
        },
      };

      yield {
        type: 'content',
        data: {
          content: `**24h 目标价:** $${prediction.priceTarget24h.toFixed(8)}\n`,
        },
      };

      // 信号
      if (prediction.signals && prediction.signals.length > 0) {
        yield {
          type: 'content',
          data: {
            content: `\n✅ **看多信号:**\n${prediction.signals.map(s => `• ${s}`).join('\n')}\n`,
          },
        };
      }

      // 风险
      if (prediction.risks && prediction.risks.length > 0) {
        yield {
          type: 'content',
          data: {
            content: `\n⚠️ **风险提示:**\n${prediction.risks.map(r => `• ${r}`).join('\n')}\n`,
          },
        };
      }

      // 分析理由
      if (prediction.reasoning) {
        yield {
          type: 'content',
          data: {
            content: `\n💡 **分析理由:** ${prediction.reasoning}\n`,
          },
        };
      }

      // Token 使用
      if (prediction.tokenUsage) {
        yield {
          type: 'content',
          data: {
            content: `\n🤖 **AI Token 消耗:** ${prediction.tokenUsage.totalTokens.toLocaleString()} tokens (${prediction.tokenUsage.model})\n`,
          },
        };
      }

      // 保存结果
      this.savePredictionEnhanced(tokenAddress, prediction, intelligence).catch(err => {
        console.error('保存预测失败:', err);
      });

      // 完成
      yield {
        type: 'done',
        data: {
          result: {
            token: intelligence.token,
            currentPrice: intelligence.price.current,
            prediction,
            tokenUsage: prediction.tokenUsage,
          },
        },
      };

    } catch (error) {
      yield {
        type: 'error',
        data: {
          error: `分析失败: ${error.message}`,
        },
      };
    }
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
