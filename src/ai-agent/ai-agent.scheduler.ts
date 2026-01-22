import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiAgentService } from './ai-agent.service';
import { StrategiesService } from '../strategies/strategies.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { MarketsService } from '../markets/markets.service';

interface PredictionRecord {
  id: string;
  token_address: string;
  prediction: string;
  confidence: number;
  price_target_24h: number;
  current_price: number;
  created_at: string;
  verified_at: string | null;
}

interface ValidationStats {
  total: number;
  correct: number;
  incorrect: number;
  avgAccuracy: number;
}

@Injectable()
export class AiAgentScheduler {
  constructor(
    private aiAgent: AiAgentService,
    private strategies: StrategiesService,
    private supabase: SupabaseService,
    private coinGecko: CoinGeckoProvider,
    private marketsService: MarketsService,
  ) {}

  /**
   * 每2分钟收集 meme 币数据并更新到 markets 表
   */
  @Cron('*/2 * * * *')
  async collectMemeCoins() {
    console.log('[Scheduler] 开始收集 meme 币数据...');

    try {
      // 从 CoinGecko 获取最热门的 5 个 meme 币
      const memeCoins = await this.coinGecko.getMemeCoins(5);

      if (memeCoins.length === 0) {
        console.log('[Scheduler] 未获取到 meme 币数据');
        return;
      }

      console.log(`[Scheduler] 获取到 ${memeCoins.length} 个 meme 币`);

      // 转换数据格式并插入到 markets 表
      const marketData = memeCoins.map((coin) => ({
        token_symbol: coin.symbol,
        token_name: coin.name,
        category: 'meme' as const,
        current_price: coin.currentPrice,
        change_24h_pct: coin.priceChangePercentage24h,
        volatility: this.calculateVolatility(coin),
        is_hot: this.isHotCoin(coin),
        ending_soon: false,
        unlock_progress_pct: Math.floor(Math.random() * 100),
        unlock_cost_usdc: 0.5,
        updated_at: new Date().toISOString(),
      }));

      const result = await this.marketsService.upsertMemeCoins(marketData);

      console.log(`[Scheduler] meme 币数据更新完成: 新增 ${result.inserted} 个, 更新 ${result.updated} 个`);
      if (result.errors.length > 0) {
        console.warn('[Scheduler] 部分更新失败:', result.errors.slice(0, 5));
      }
    } catch (error) {
      console.error('[Scheduler] meme 币收集任务失败:', error);
    }
  }

  /**
   * 计算波动性分数 (0-100)
   */
  private calculateVolatility(coin: {
    priceChangePercentage24h: number;
    priceChangePercentage7d: number;
    high24h: number;
    low24h: number;
    currentPrice: number;
  }): number {
    // 基于24小时涨跌幅、7天涨跌幅和日内振幅计算波动性
    const change24h = Math.abs(coin.priceChangePercentage24h || 0);
    const change7d = Math.abs(coin.priceChangePercentage7d || 0);
    const dayRange = coin.currentPrice > 0
      ? ((coin.high24h - coin.low24h) / coin.currentPrice) * 100
      : 0;

    // 加权平均，并归一化到0-100
    const rawVolatility = change24h * 0.4 + change7d * 0.3 / 7 + dayRange * 0.3;
    return Math.min(100, Math.max(0, Math.round(rawVolatility * 2)));
  }

  /**
   * 判断是否为热门币
   */
  private isHotCoin(coin: {
    priceChangePercentage24h: number;
    totalVolume: number;
    marketCapRank: number;
  }): boolean {
    // 24小时涨幅超过10%，或交易量大且排名靠前
    return (
      coin.priceChangePercentage24h > 10 ||
      (coin.totalVolume > 100000000 && coin.marketCapRank < 200)
    );
  }

  /**
   * 每30分钟扫描一次热门 meme 币
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scanHotMemeCoins() {
    console.log('[Scheduler] 开始扫描热门 meme 币...');

    try {
      const hotTokens = await this.aiAgent.getHotMemeTokens(5);

      for (const token of hotTokens) {
        try {
          const analysis = await this.aiAgent.analyzeMeme(token.address);

          // 如果预测强烈看多且信心度高
          if (
            analysis.prediction.prediction === 'bullish' &&
            analysis.prediction.confidence > 75
          ) {
            console.log(`[Scheduler] 发现高潜力币: ${token.symbol}`);

            // 自动生成交易策略
            await this.strategies.generateStrategy(
              `AI发现: ${token.symbol} 强势信号`,
              `${token.symbol} AI Auto`,
            );
          }
        } catch (error) {
          console.error(`[Scheduler] 分析 ${token.symbol} 失败:`, error);
        }
      }

      console.log('[Scheduler] 热门币扫描完成');
    } catch (error) {
      console.error('[Scheduler] 热门币扫描任务失败:', error);
    }
  }

  /**
   * 每天午夜验证24h前的预测结果
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async validatePredictions() {
    console.log('[Scheduler] 开始验证历史预测准确率...');

    try {
      // 查询24h前创建且未验证的预测
      const predictionsToValidate = await this.getUnvalidatedPredictions();

      if (predictionsToValidate.length === 0) {
        console.log('[Scheduler] 没有需要验证的预测记录');
        return;
      }

      console.log(`[Scheduler] 找到 ${predictionsToValidate.length} 条待验证预测`);

      const results: { id: string; success: boolean; error?: string }[] = [];

      // 逐个验证预测
      for (const prediction of predictionsToValidate) {
        try {
          await this.aiAgent.validatePrediction(prediction.id);
          results.push({ id: prediction.id, success: true });
          console.log(`[Scheduler] 验证预测 ${prediction.id} 成功`);

          // 添加延迟避免 API 限流
          await this.delay(1000);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.push({ id: prediction.id, success: false, error: errorMsg });
          console.error(`[Scheduler] 验证预测 ${prediction.id} 失败:`, errorMsg);
        }
      }

      // 生成验证报告
      const stats = await this.generateValidationStats();
      console.log('[Scheduler] 验证完成，统计信息:', stats);

      // 记录验证批次日志
      await this.logValidationBatch(results, stats);

    } catch (error) {
      console.error('[Scheduler] 预测验证任务失败:', error);
    }
  }

  /**
   * 每6小时执行一次快速验证（针对高信心预测）
   */
  @Cron('0 */6 * * *')
  async quickValidateHighConfidence() {
    console.log('[Scheduler] 开始快速验证高信心预测...');

    try {
      // 查询6-24小时前、信心度>80且未验证的预测
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data: predictions, error } = await this.supabase
        .getClient()
        .from('ai_predictions')
        .select('*')
        .gt('confidence', 80)
        .is('verified_at', null)
        .lt('created_at', sixHoursAgo.toISOString())
        .gt('created_at', twentyFourHoursAgo.toISOString())
        .limit(10);

      if (error || !predictions || predictions.length === 0) {
        console.log('[Scheduler] 没有需要快速验证的高信心预测');
        return;
      }

      console.log(`[Scheduler] 快速验证 ${predictions.length} 条高信心预测`);

      for (const prediction of predictions) {
        try {
          const result = await this.aiAgent.validatePrediction(prediction.id);

          // 如果高信心预测错误，记录警告
          if (!result.directionCorrect) {
            console.warn(
              `[Scheduler] 高信心预测失败警告: ${prediction.token_address}`,
              `预测: ${prediction.prediction}, 信心: ${prediction.confidence}%`
            );
          }

          await this.delay(500);
        } catch (error) {
          console.error(`[Scheduler] 快速验证 ${prediction.id} 失败:`, error);
        }
      }

      console.log('[Scheduler] 快速验证完成');
    } catch (error) {
      console.error('[Scheduler] 快速验证任务失败:', error);
    }
  }

  /**
   * 获取需要验证的预测记录
   * 条件：创建时间超过24小时且未验证
   */
  private async getUnvalidatedPredictions(): Promise<PredictionRecord[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .getClient()
      .from('ai_predictions')
      .select('*')
      .is('verified_at', null)
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(50); // 每次最多验证50条

    if (error) {
      console.error('[Scheduler] 查询待验证预测失败:', error);
      return [];
    }

    return data || [];
  }

  /**
   * 生成验证统计信息
   */
  private async generateValidationStats(): Promise<ValidationStats> {
    const { data, error } = await this.supabase
      .getClient()
      .from('ai_predictions')
      .select('actual_result, accuracy_score')
      .not('verified_at', 'is', null);

    if (error || !data) {
      return { total: 0, correct: 0, incorrect: 0, avgAccuracy: 0 };
    }

    const total = data.length;
    const correct = data.filter(d => d.actual_result === 'correct').length;
    const incorrect = data.filter(d => d.actual_result === 'incorrect').length;

    const accuracyScores = data
      .map(d => d.accuracy_score)
      .filter((s): s is number => s !== null);

    const avgAccuracy = accuracyScores.length > 0
      ? accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length
      : 0;

    return {
      total,
      correct,
      incorrect,
      avgAccuracy: Math.round(avgAccuracy * 100) / 100,
    };
  }

  /**
   * 记录验证批次日志
   */
  private async logValidationBatch(
    results: { id: string; success: boolean; error?: string }[],
    stats: ValidationStats
  ) {
    try {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      console.log('[Scheduler] 验证批次报告:');
      console.log(`  - 本次验证: ${results.length} 条`);
      console.log(`  - 成功: ${successCount}, 失败: ${failCount}`);
      console.log(`  - 累计统计: 总计 ${stats.total} 条`);
      console.log(`  - 预测正确: ${stats.correct} 条 (${stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0}%)`);
      console.log(`  - 预测错误: ${stats.incorrect} 条`);
      console.log(`  - 平均准确度: ${stats.avgAccuracy}%`);

      // 可选：将统计信息存入数据库
      // await this.supabase.getClient()
      //   .from('validation_logs')
      //   .insert({
      //     validated_count: results.length,
      //     success_count: successCount,
      //     fail_count: failCount,
      //     overall_stats: stats,
      //     created_at: new Date().toISOString(),
      //   });

    } catch (error) {
      console.error('[Scheduler] 记录验证日志失败:', error);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
