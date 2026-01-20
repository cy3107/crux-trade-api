import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { MarketIntelligence } from './market-intelligence.service';

interface TokenData {
  onChain: any;
  social: any;
  market: any;
}

interface EnhancedTokenData extends TokenData {
  news?: any;
  composite?: any;
}

interface PredictionResult {
  prediction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  priceTarget24h: number;
  signals: string[];
  risks: string[];
  reasoning: string;
}

@Injectable()
export class AiEngineService {
  private proxyAgent: ProxyAgent | null = null;

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
        ...options.headers,
      },
    };

    if (this.proxyAgent) {
      fetchOptions.dispatcher = this.proxyAgent;
    }

    return undiciFetch(url, fetchOptions) as unknown as Response;
  }

  /**
   * 使用 Groq API 进行 AI 分析
   * Groq 优势: 免费、速度快 (比 GPT-4 快10倍)
   */
  async predictMemePrice(data: TokenData): Promise<PredictionResult> {
    const groqApiKey = this.config.get('GROQ_API_KEY');

    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    try {
      const response = await this.fetchWithProxy('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mixtral-8x7b-32768',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: this.buildAnalysisPrompt(data),
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      const result = await response.json();
      const content = result.choices[0].message.content;

      // 解析 JSON 响应
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                       content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('AI 返回格式错误');
      }

      const prediction = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return prediction;

    } catch (error) {
      console.error('AI 分析失败:', error);
      throw error;
    }
  }

  /**
   * 增强版 AI 分析 - 使用多数据源情报
   */
  async predictMemePriceEnhanced(
    data: EnhancedTokenData,
    intelligence: MarketIntelligence
  ): Promise<PredictionResult> {
    const groqApiKey = this.config.get('GROQ_API_KEY');

    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    try {
      const response = await this.fetchWithProxy('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', // Groq 最新 70B 模型
          messages: [
            {
              role: 'system',
              content: this.getEnhancedSystemPrompt(),
            },
            {
              role: 'user',
              content: this.buildEnhancedAnalysisPrompt(data, intelligence),
            },
          ],
          temperature: 0.6,
          max_tokens: 1500,
        }),
      });

      const result = await response.json();
      console.log(result);
      
      if (!result.choices || !result.choices[0]) {
        throw new Error('API 返回格式错误');
      }

      const content = result.choices[0].message.content;

      // 解析 JSON 响应
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                       content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('AI 返回格式错误');
      }

      const prediction = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return prediction;

    } catch (error) {
      console.error('增强版 AI 分析失败:', error);
      throw error;
    }
  }

  /**
   * 增强版系统提示词
   */
  private getEnhancedSystemPrompt(): string {
    return `你是一个专业的加密货币分析师，擅长分析 meme 币。你需要基于多维度数据给出准确的预测：

## 分析维度
1. **价格数据**: 当前价格、涨跌幅、交易量、市值
2. **新闻情绪**: CryptoPanic 新闻情绪分析
3. **社区热度**: Reddit 讨论热度和情绪
4. **链上数据**: 持有者分布、交易活跃度、流动性

## 预测规则
- bullish: 多个维度显示积极信号，建议买入
- bearish: 多个维度显示消极信号，建议观望/卖出
- neutral: 信号混合，趋势不明朗

## 输出要求
必须输出严格的 JSON 格式，不要包含任何其他文字。`;
  }

  /**
   * 增强版分析提示词
   */
  private buildEnhancedAnalysisPrompt(data: EnhancedTokenData, intel: MarketIntelligence): string {
    return `
请分析以下代币的多维度数据并给出预测：

## 基本信息
- Token: ${intel.token.symbol} (${intel.token.name})
- Chain: ${intel.token.chain}
- 数据来源: ${intel.meta.sources.join(', ')}
- 数据质量: ${intel.meta.dataQuality}%

## 价格数据
- 当前价格: $${intel.price.current.toFixed(8)}
- 24h 涨跌: ${intel.price.change24h > 0 ? '+' : ''}${intel.price.change24h.toFixed(2)}%
- 7d 涨跌: ${intel.price.change7d > 0 ? '+' : ''}${intel.price.change7d.toFixed(2)}%
- 30d 涨跌: ${intel.price.change30d > 0 ? '+' : ''}${intel.price.change30d.toFixed(2)}%
- 24h 交易量: $${intel.price.volume24h.toLocaleString()}
- 市值: $${intel.price.marketCap.toLocaleString()}
- 市值排名: #${intel.price.rank || 'N/A'}
- ATH: $${intel.price.ath.toFixed(8)} (${intel.price.athChangePercent.toFixed(1)}% from ATH)

## 新闻情绪 (CryptoPanic)
- 整体情绪: ${intel.news.sentiment}
- 情绪分数: ${intel.news.score} (-100 到 100)
- 新闻数量: ${intel.news.count}
- 正面新闻: ${intel.news.positiveCount} / 负面新闻: ${intel.news.negativeCount}
${intel.news.headlines.length > 0 ? '- 热门标题:\n' + intel.news.headlines.map(h => `  * ${h}`).join('\n') : ''}

## Reddit 社区
- 社区情绪: ${intel.reddit.sentiment}
- 情绪分数: ${intel.reddit.score}
- 讨论数量: ${intel.reddit.mentions}
- 讨论趋势: ${intel.reddit.trend}
${intel.reddit.topDiscussion ? `- 热门讨论: ${intel.reddit.topDiscussion}` : ''}

## 链上数据
- 24h 交易数: ${intel.onChain.txns24h}
- 持有者数量: ${intel.onChain.holders}
- 流动性: $${intel.onChain.liquidity.toLocaleString()}
- 前10持有占比: ${intel.onChain.top10HoldingPct}%

## 系统预分析
- 综合情绪: ${intel.composite.overallSentiment}
- 信心评分: ${intel.composite.confidenceScore}
- 风险等级: ${intel.composite.riskLevel}
- 看多信号: ${intel.composite.signals.join('; ') || '无'}
- 风险提示: ${intel.composite.risks.join('; ') || '无'}

请基于以上数据，输出以下 JSON 格式的预测结果：

\`\`\`json
{
  "prediction": "bullish" | "bearish" | "neutral",
  "confidence": 0-100 的信心分数,
  "priceTarget24h": 24小时目标价格 (数字),
  "signals": ["看多信号1", "看多信号2", ...],
  "risks": ["风险点1", "风险点2", ...],
  "reasoning": "详细分析理由，包括对各数据维度的解读 (100字以内)"
}
\`\`\`
`;
  }

  /**
   * 系统提示词
   */
  private getSystemPrompt(): string {
    return `你是一个专业的 meme 币分析专家，具备以下能力：
1. 分析链上数据识别趋势
2. 解读社交媒体情绪
3. 评估市场风险
4. 给出准确的价格预测

请基于提供的数据，输出严格的 JSON 格式预测结果。`;
  }

  /**
   * 构建分析提示词
   */
  private buildAnalysisPrompt(data: TokenData): string {
    return `
请分析以下 meme 币数据并给出预测：

## 市场数据
- Token: ${data.market.symbol}
- 当前价格: $${data.market.priceUsd}
- 24h 涨跌: ${data.market.priceChange24h}%
- 24h 交易量: $${data.market.volume24h.toLocaleString()}
- 流动性: $${data.market.liquidity.toLocaleString()}
- 市值: $${data.market.marketCap.toLocaleString()}
- 24h 交易笔数: ${data.market.txns24h}

## 链上数据
- 持有者数量: ${data.onChain.holderCount}
- 前10持有占比: ${data.onChain.top10HoldingPct}%
- 24h 新增持有者: ${data.onChain.newHolders24h}

## 社交数据
- 社交评分: ${data.social.socialScore}/100

请严格按以下 JSON 格式输出：
\`\`\`json
{
  "prediction": "bullish" | "bearish" | "neutral",
  "confidence": 0-100 的数字,
  "priceTarget24h": 24小时预测价格,
  "signals": ["看多/看空信号1", "信号2", "信号3"],
  "risks": ["风险点1", "风险点2"],
  "reasoning": "简要分析理由 (50字以内)"
}
\`\`\`
`;
  }

  /**
   * 备用方案: 基于规则的简单预测 (无需 AI)
   */
  async fallbackPrediction(data: TokenData): Promise<PredictionResult> {
    let score = 0;
    const signals: string[] = [];
    const risks: string[] = [];

    // 评分规则
    if (data.market.priceChange24h > 10) {
      score += 20;
      signals.push('24h涨幅强劲');
    }
    if (data.market.volume24h > 100000) {
      score += 15;
      signals.push('交易量活跃');
    }
    if (data.social.socialScore > 70) {
      score += 25;
      signals.push('社交热度高');
    }
    if (data.onChain.newHolders24h > 50) {
      score += 20;
      signals.push('新增持有者多');
    }

    // 风险评估
    if (data.onChain.top10HoldingPct > 50) {
      score -= 15;
      risks.push('筹码过于集中');
    }
    if (data.market.liquidity < 50000) {
      risks.push('流动性不足');
    }

    const prediction = score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';

    return {
      prediction,
      confidence: Math.min(Math.abs(score - 50) * 2, 95),
      priceTarget24h: data.market.priceUsd * (1 + (score - 50) / 100),
      signals,
      risks,
      reasoning: '基于多维度数据综合评估',
    };
  }
}
