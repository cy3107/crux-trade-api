import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import { AnalyzeTokenDto } from './dto/analyze-token.dto';

@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(private aiAgent: AiAgentService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'AI Agent 分析单个 meme 币' })
  @ApiBody({ type: AnalyzeTokenDto })
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
}
