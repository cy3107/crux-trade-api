import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import { AnalyzeTokenDto } from './dto/analyze-token.dto';
import { ChatInputDto } from './dto/chat-input.dto';
import { ApiKeyGuard, RateLimitGuard, RateLimit } from '../common/guards';

@ApiTags('ai-agent')
@Controller('ai-agent')
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class AiAgentController {
  constructor(private aiAgent: AiAgentService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'AI Agent 分析单个 meme 币' })
  @ApiBody({ type: AnalyzeTokenDto })
  @RateLimit({ limit: 10, windowMs: 60 * 1000 }) // AI 分析每分钟限制 10 次
  async analyze(@Body() dto: AnalyzeTokenDto) {
    try {
      const result = await this.aiAgent.analyzeMeme(
        dto.tokenAddress,
        dto.chain || 'ethereum',
      );

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Analysis failed',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('hot-memes')
  @ApiOperation({ summary: '获取当前热门 meme 币' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量限制' })
  async getHotMemes(@Query('limit') limit?: string) {
    try {
      const tokens = await this.aiAgent.getHotMemeTokens(
        parseInt(limit || '10'),
      );

      return {
        success: true,
        data: tokens,
        count: tokens.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to fetch hot memes',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('predictions/history')
  @ApiOperation({ summary: '查看历史预测记录' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量限制' })
  async getPredictionHistory(@Query('limit') limit?: string) {
    try {
      const predictions = await this.aiAgent.getPredictionHistory(
        parseInt(limit || '20'),
      );

      return {
        success: true,
        data: predictions,
        count: predictions.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to fetch prediction history',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('predictions/:id/validate')
  @ApiOperation({ summary: '验证历史预测准确率' })
  @ApiParam({ name: 'id', description: '预测记录 ID' })
  async validatePrediction(@Param('id') id: string) {
    try {
      const result = await this.aiAgent.validatePrediction(id);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Validation failed',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('validate-input')
  @ApiOperation({ summary: '验证用户输入是否合法' })
  @ApiBody({ type: ChatInputDto })
  async validateInput(@Body() dto: ChatInputDto) {
    const validation = this.aiAgent.validateInput(dto.input);

    return {
      success: true,
      data: validation,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('analyze-stream')
  @ApiOperation({ summary: 'AI Agent 流式分析 meme 币 (SSE)' })
  @ApiBody({ type: ChatInputDto })
  @RateLimit({ limit: 10, windowMs: 60 * 1000 }) // AI 分析每分钟限制 10 次
  async analyzeStream(
    @Body() dto: ChatInputDto,
    @Res() res: Response,
  ) {
    // 1. 先验证输入
    const validation = this.aiAgent.validateInput(dto.input);

    if (!validation.valid) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 发送错误事件
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: {
          error: validation.reason,
        },
      })}\n\n`);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        data: {},
      })}\n\n`);

      res.end();
      return;
    }

    // 2. 处理不同类型的查询
    if (validation.type === 'hot_query') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.write(`data: ${JSON.stringify({
        type: 'progress',
        data: {
          stage: 'fetching',
          progress: 50,
          message: '获取热门 meme 币...',
        },
      })}\n\n`);

      const tokens = await this.aiAgent.getHotMemeTokens(10);

      res.write(`data: ${JSON.stringify({
        type: 'content',
        data: {
          content: this.formatHotMemesText(tokens),
        },
      })}\n\n`);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        data: { tokens },
      })}\n\n`);

      res.end();
      return;
    }

    if (validation.type === 'help_query') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.write(`data: ${JSON.stringify({
        type: 'content',
        data: {
          content: this.getHelpText(),
        },
      })}\n\n`);

      res.write(`data: ${JSON.stringify({
        type: 'done',
        data: {},
      })}\n\n`);

      res.end();
      return;
    }

    // 3. Token 地址分析 - 使用流式输出
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const stream = this.aiAgent.analyzeMemeStreaming(
        validation.tokenAddress!,
        dto.chain || validation.chain || 'ethereum',
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: {
          error: error.message || '分析失败',
        },
      })}\n\n`);
    }

    res.end();
  }

  /**
   * 格式化热门币列表
   */
  private formatHotMemesText(tokens: any[]): string {
    if (!tokens || tokens.length === 0) {
      return '暂无热门 meme 币数据';
    }

    let text = `**🔥 热门 Meme 币 Top ${tokens.length}**\n\n`;

    tokens.forEach((token, index) => {
      text += `**${index + 1}. ${token.symbol}**`;
      if (token.name) {
        text += ` (${token.name})`;
      }
      text += '\n';

      if (token.priceUsd) {
        text += `   💰 价格: $${parseFloat(token.priceUsd).toFixed(8)}\n`;
      }
      text += `   📊 24h交易量: $${token.volume24h?.toLocaleString() || 'N/A'}\n`;
      if (token.priceChange24h !== undefined) {
        const changeEmoji = token.priceChange24h > 0 ? '📈' : token.priceChange24h < 0 ? '📉' : '➡️';
        text += `   ${changeEmoji} 24h涨跌: ${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%\n`;
      }
      text += `   🔗 地址: \`${token.address}\`\n\n`;
    });

    return text;
  }

  /**
   * 帮助文本
   */
  private getHelpText(): string {
    return `**How to use AI Meme Analyst:**

• **分析代币** - 直接粘贴 Token 合约地址 (支持 ETH/BSC/Solana)
• **查看热门** - 输入 "hot" 或 "trending"
• **获取帮助** - 输入 "help" 或 "帮助"

**示例地址:**
• SHIB: \`0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE\`
• PEPE: \`0x6982508145454Ce325dDbE47a25d4ec3d2311933\`

**分析内容包括:**
- AI 价格预测 (看多/看空/中性)
- 信心度评分
- 市场数据分析
- 新闻情绪分析
- 社区热度追踪
- 风险评估`;
  }
}
