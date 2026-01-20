# Web3 Meme币预测 AI Agent 集成指南

## 一、项目准备

### 1.1 创建 AI Agent 模块
```bash
# 创建模块、服务、控制器
nest g module ai-agent
nest g service ai-agent
nest g controller ai-agent
```

### 1.2 安装依赖包
```bash
npm install @nestjs/schedule  # 定时任务
npm install node-cron          # cron 表达式支持
```

### 1.3 环境变量配置
在 `.env` 文件中添加：
```env
# AI 模型
GROQ_API_KEY=your_groq_api_key

# Web3 数据
DEXSCREENER_API_KEY=optional  # 免费使用无需 key

# 社交数据 (可选)
TWITTER_API_KEY=your_twitter_key
TELEGRAM_BOT_TOKEN=your_bot_token
```

---

## 二、数据收集层

### 2.1 创建 Web3 数据提供者
**文件路径**: `src/ai-agent/providers/web3-data.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class Web3DataProvider {
  /**
   * 获取 Token 基础信息
   * 使用 DexScreener API (免费)
   */
  async getTokenMetrics(tokenAddress: string) {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
      );
      const data = await response.json();
      
      if (!data.pairs || data.pairs.length === 0) {
        throw new Error('Token not found');
      }

      const pair = data.pairs[0]; // 取流动性最高的交易对
      
      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        priceUsd: parseFloat(pair.priceUsd),
        volume24h: parseFloat(pair.volume.h24),
        liquidity: parseFloat(pair.liquidity.usd),
        priceChange24h: parseFloat(pair.priceChange.h24),
        txns24h: pair.txns.h24.buys + pair.txns.h24.sells,
        marketCap: parseFloat(pair.fdv || 0),
      };
    } catch (error) {
      console.error('获取 Token 数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取持有者数据
   * 使用 Moralis API 或直接读取合约
   */
  async getHolderData(tokenAddress: string) {
    // 方案1: Moralis API (有免费额度)
    // 方案2: 使用 ethers.js 直接读取合约
    
    return {
      holderCount: 0,      // 总持有者数量
      top10HoldingPct: 0,  // 前10持有者占比
      whaleAddresses: [],   // 巨鲸地址列表
    };
  }

  /**
   * 获取链上活动数据
   */
  async getOnChainActivity(tokenAddress: string) {
    return {
      newHolders24h: 0,     // 24h 新增持有者
      activeTraders24h: 0,  // 24h 活跃交易者
      avgTxSize: 0,         // 平均交易规模
    };
  }
}
```

### 2.2 创建社交数据提供者
**文件路径**: `src/ai-agent/providers/social-data.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SocialDataProvider {
  constructor(private config: ConfigService) {}

  /**
   * 获取 Twitter 提及数据
   * 使用 RapidAPI 的 Twitter 服务
   */
  async getTwitterMentions(tokenSymbol: string) {
    // 免费方案: 使用 RapidAPI 的免费额度
    const apiKey = this.config.get('TWITTER_API_KEY');
    
    if (!apiKey) {
      return { mentions24h: 0, sentiment: 'neutral' };
    }

    try {
      // 示例: 搜索最近24h的推文
      const response = await fetch(
        `https://twitter-api45.p.rapidapi.com/search.php?query=${tokenSymbol}&search_type=Latest`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
          },
        }
      );
      
      const data = await response.json();
      
      return {
        mentions24h: data.timeline?.length || 0,
        sentiment: this.analyzeSentiment(data.timeline),
        influencerMentions: 0,  // 大V提及数
      };
    } catch (error) {
      console.error('获取 Twitter 数据失败:', error);
      return { mentions24h: 0, sentiment: 'neutral' };
    }
  }

  /**
   * 简单情感分析
   */
  private analyzeSentiment(tweets: any[]): 'bullish' | 'bearish' | 'neutral' {
    if (!tweets || tweets.length === 0) return 'neutral';
    
    const positiveWords = ['moon', 'bullish', '🚀', 'buy', 'pump'];
    const negativeWords = ['dump', 'scam', 'rug', 'bearish', 'sell'];
    
    let score = 0;
    tweets.forEach(tweet => {
      const text = tweet.text?.toLowerCase() || '';
      positiveWords.forEach(word => {
        if (text.includes(word)) score++;
      });
      negativeWords.forEach(word => {
        if (text.includes(word)) score--;
      });
    });
    
    if (score > 5) return 'bullish';
    if (score < -5) return 'bearish';
    return 'neutral';
  }

  /**
   * 获取 Telegram 群组数据
   */
  async getTelegramActivity(channelUsername: string) {
    // 使用 Telegram Bot API
    return {
      memberCount: 0,
      messagesLast24h: 0,
      activeUsers24h: 0,
    };
  }

  /**
   * 汇总社交指标
   */
  async getCommunityMetrics(tokenSymbol: string) {
    const twitter = await this.getTwitterMentions(tokenSymbol);
    
    return {
      twitter,
      // telegram: await this.getTelegramActivity('channelName'),
      socialScore: this.calculateSocialScore(twitter),
    };
  }

  private calculateSocialScore(twitter: any): number {
    // 简单评分: 0-100
    let score = 0;
    
    score += Math.min(twitter.mentions24h / 10, 50); // 提及数最高50分
    
    if (twitter.sentiment === 'bullish') score += 30;
    else if (twitter.sentiment === 'neutral') score += 15;
    
    return Math.min(score, 100);
  }
}
```

---

## 三、AI 分析层

### 3.1 创建 AI 引擎服务
**文件路径**: `src/ai-agent/ai-engine.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenData {
  onChain: any;
  social: any;
  market: any;
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
  constructor(private config: ConfigService) {}

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
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mixtral-8x7b-32768',  // 或使用 'llama-3.1-70b-versatile'
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
- Twitter 提及数: ${data.social.twitter.mentions24h}
- 情绪: ${data.social.twitter.sentiment}
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
```

---

## 四、核心 Agent 服务

### 4.1 创建主服务
**文件路径**: `src/ai-agent/ai-agent.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Web3DataProvider } from './providers/web3-data.provider';
import { SocialDataProvider } from './providers/social-data.provider';
import { AiEngineService } from './ai-engine.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class AiAgentService {
  constructor(
    private web3Data: Web3DataProvider,
    private socialData: SocialDataProvider,
    private aiEngine: AiEngineService,
    private supabase: SupabaseService,
  ) {}

  /**
   * 核心方法: 分析 meme 币
   */
  async analyzeMeme(tokenAddress: string, chain: string = 'ethereum') {
    try {
      // 1️⃣ 数据收集阶段
      console.log('🔍 收集数据中...');
      const market = await this.web3Data.getTokenMetrics(tokenAddress);
      const onChain = await this.web3Data.getHolderData(tokenAddress);
      const social = await this.socialData.getCommunityMetrics(market.symbol);

      const collectedData = { market, onChain, social };

      // 2️⃣ AI 分析阶段
      console.log('🤖 AI 分析中...');
      let prediction;
      try {
        prediction = await this.aiEngine.predictMemePrice(collectedData);
      } catch (error) {
        console.log('AI 分析失败，使用备用规则引擎');
        prediction = await this.aiEngine.fallbackPrediction(collectedData);
      }

      // 3️⃣ 保存结果
      await this.savePrediction(tokenAddress, prediction, collectedData);

      // 4️⃣ 返回完整报告
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
          social: social.socialScore,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('分析失败:', error);
      throw new Error(`分析 ${tokenAddress} 失败: ${error.message}`);
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
        verified_at: null, // 24h后验证
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
    // 从 DexScreener 获取热门 meme 币
    try {
      const response = await fetch(
        'https://api.dexscreener.com/latest/dex/search?q=meme'
      );
      const data = await response.json();
      
      return data.pairs
        .filter(p => p.volume.h24 > 10000) // 过滤低流动性
        .slice(0, limit)
        .map(p => ({
          address: p.baseToken.address,
          symbol: p.baseToken.symbol,
          volume24h: p.volume.h24,
        }));
    } catch (error) {
      return [];
    }
  }
}
```

---

## 五、控制器层

### 5.1 创建 API 端点
**文件路径**: `src/ai-agent/ai-agent.controller.ts`

```typescript
import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';

class AnalyzeTokenDto {
  tokenAddress: string;
  chain?: 'ethereum' | 'bsc' | 'solana' | 'base';
}

@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(private aiAgent: AiAgentService) {}

  @Post('analyze')
  @ApiOperation({ summary: '🤖 AI Agent 分析单个 meme 币' })
  @ApiBody({ type: AnalyzeTokenDto })
  async analyze(@Body() dto: AnalyzeTokenDto) {
    const result = await this.aiAgent.analyzeMeme(
      dto.tokenAddress,
      dto.chain || 'ethereum',
    );

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('hot-memes')
  @ApiOperation({ summary: '🔥 获取当前热门 meme 币' })
  async getHotMemes(@Query('limit') limit?: string) {
    const tokens = await this.aiAgent.getHotMemeTokens(
      parseInt(limit || '10'),
    );

    return {
      success: true,
      data: tokens,
    };
  }

  @Get('predictions/history')
  @ApiOperation({ summary: '📊 查看历史预测记录' })
  async getPredictionHistory(@Query('limit') limit?: string) {
    // 从数据库查询历史预测
    return {
      success: true,
      data: [], // 实现数据库查询
    };
  }
}
```

---

## 六、定时任务 (可选)

### 6.1 自动扫描热门币
**文件路径**: `src/ai-agent/ai-agent.scheduler.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiAgentService } from './ai-agent.service';
import { StrategiesService } from '../strategies/strategies.service';

@Injectable()
export class AiAgentScheduler {
  constructor(
    private aiAgent: AiAgentService,
    private strategies: StrategiesService,
  ) {}

  /**
   * 每30分钟扫描一次热门 meme 币
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scanHotMemeCoins() {
    console.log('🔍 开始扫描热门 meme 币...');

    const hotTokens = await this.aiAgent.getHotMemeTokens(5);

    for (const token of hotTokens) {
      try {
        const analysis = await this.aiAgent.analyzeMeme(token.address);

        // 如果预测强烈看多且信心度高
        if (
          analysis.prediction.prediction === 'bullish' &&
          analysis.prediction.confidence > 75
        ) {
          console.log(`🚀 发现高潜力币: ${token.symbol}`);

          // 自动生成交易策略
          await this.strategies.generateStrategy(
            `AI发现: ${token.symbol} 强势信号`,
            `${token.symbol} AI Auto`,
          );
        }
      } catch (error) {
        console.error(`分析 ${token.symbol} 失败:`, error);
      }
    }
  }

  /**
   * 每天验证昨天的预测结果
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async validatePredictions() {
    console.log('✅ 验证历史预测准确率...');
    // 实现: 对比24h前的预测和实际价格
  }
}
```

---

## 七、模块注册

### 7.1 完整模块配置
**文件路径**: `src/ai-agent/ai-agent.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AiEngineService } from './ai-engine.service';
import { Web3DataProvider } from './providers/web3-data.provider';
import { SocialDataProvider } from './providers/social-data.provider';
import { AiAgentScheduler } from './ai-agent.scheduler';
import { SupabaseService } from '../common/supabase/supabase.service';
import { StrategiesService } from '../strategies/strategies.service';

@Module({
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    AiEngineService,
    Web3DataProvider,
    SocialDataProvider,
    AiAgentScheduler,
    SupabaseService,
    StrategiesService,
  ],
  exports: [AiAgentService], // 导出供其他模块使用
})
export class AiAgentModule {}
```

### 7.2 在主模块注册
**文件路径**: `src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';  // 新增
import { AiAgentModule } from './ai-agent/ai-agent.module';  // 新增
// ... 其他导入

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),  // 启用定时任务
    AiAgentModule,  // 注册 AI Agent 模块
    // ... 其他模块
  ],
})
export class AppModule {}
```

---

## 八、数据库设计 (Supabase)

### 8.1 创建预测记录表
在 Supabase 中执行以下 SQL:

```sql
-- AI 预测记录表
CREATE TABLE ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  prediction TEXT CHECK (prediction IN ('bullish', 'bearish', 'neutral')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  price_target_24h DECIMAL,
  current_price DECIMAL,
  signals TEXT[],
  risks TEXT[],
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 验证字段
  verified_at TIMESTAMPTZ,
  actual_price_24h DECIMAL,
  actual_result TEXT,
  accuracy_score INTEGER
);

-- 创建索引
CREATE INDEX idx_predictions_token ON ai_predictions(token_address);
CREATE INDEX idx_predictions_created ON ai_predictions(created_at DESC);
```

---

## 九、使用示例

### 9.1 API 调用示例

```bash
# 1. 分析单个 Token
curl -X POST http://localhost:3000/ai-agent/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    "chain": "ethereum"
  }'

# 2. 获取热门 meme 币
curl http://localhost:3000/ai-agent/hot-memes?limit=5

# 3. 查看历史预测
curl http://localhost:3000/ai-agent/predictions/history?limit=20
```

### 9.2 前端集成示例

```typescript
// React 组件示例
async function analyzeMeme(tokenAddress: string) {
  const response = await fetch('/api/ai-agent/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAddress }),
  });
  
  const result = await response.json();
  
  if (result.success) {
    const { prediction, token } = result.data;
    
    console.log(`${token.symbol} 预测:`, prediction.prediction);
    console.log('信心度:', prediction.confidence + '%');
    console.log('24h目标价:', prediction.priceTarget24h);
  }
}
```

---

## 十、优化建议

### 10.1 性能优化
1. **添加缓存**: 使用 Redis 缓存 API 调用结果 (5-15分钟)
2. **批量处理**: 一次分析多个 Token，减少 API 调用
3. **异步队列**: 使用 Bull 队列处理耗时任务

### 10.2 准确率提升
1. **历史数据训练**: 收集预测结果，优化 Prompt
2. **多模型集成**: 结合规则引擎 + AI 模型
3. **实时学习**: 根据验证结果动态调整权重

### 10.3 功能扩展
1. **多链支持**: 扩展到 BSC、Solana、Base 等
2. **实时监控**: WebSocket 推送价格异动提醒
3. **自动交易**: 集成钱包，自动执行策略

---

## 十一、成本预估

| 服务 | 免费额度 | 成本 |
|------|---------|------|
| Groq API | 6000 requests/min | 免费 |
| DexScreener API | 无限制 | 免费 |
| Supabase | 500MB 数据库 | 免费 |
| RapidAPI (Twitter) | 100 requests/月 | $0-9.99/月 |

**总计**: 基础版本可以完全免费运行！

---

## 十二、启动项目

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 GROQ_API_KEY

# 3. 启动开发服务器
npm run start:dev

# 4. 访问 Swagger 文档
# http://localhost:3000/api
```

---

## 总结

这个 AI Agent 方案具备：
✅ 完全免费 (使用 Groq + DexScreener)  
✅ 实时数据 (链上 + 社交)  
✅ AI 驱动预测  
✅ 自动化监控  
✅ 可扩展架构  

立即开始构建你的 meme 币预测系统吧! 🚀
