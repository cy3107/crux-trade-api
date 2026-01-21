import { Controller, Post, Body, Get } from '@nestjs/common';
import { StrategiesService } from './strategies.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

class GenerateStrategyDto {
  prompt: string; // 用户输入，如 "我想做多PEPE，控制风险"
  name?: string; // 可选策略名称
}

class SaveStrategyDto {
  strategy: Record<string, any>;
  name?: string;
}

@ApiTags('strategies')
@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Post('generate')
  @ApiOperation({ summary: 'AI 生成交易策略（带可视化 Workflow）' })
  @ApiBody({ type: GenerateStrategyDto })
  async generate(@Body() body: GenerateStrategyDto) {
    const strategy = this.strategiesService.generateStrategy(
      body.prompt || 'Create a trending meme strategy',
      body.name,
    );

    return {
      success: true,
      data: {
        strategy,
        aiSource: 'mock (demo mode)', // 真实上线改成 'groq'
        generatedAt: new Date().toISOString(),
      },
    };
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户保存的策略列表' })
  getMyStrategies() {
    return {
      success: true,
      data: this.strategiesService.getSavedStrategies(),
    };
  }

  @Post('save')
  @ApiOperation({ summary: '保存 AI 生成的策略（可选）' })
  saveStrategy(@Body() body: SaveStrategyDto) {
    return {
      success: true,
      data: this.strategiesService.saveStrategy(body),
    };
  }
}
