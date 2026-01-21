import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('insights')
@Controller('insights')
export class InsightsController {
  @Get('home')
  @ApiOperation({ summary: '首页 AI Insight 卡片' })
  getHomeInsight() {
    return {
      success: true,
      data: {
        signal: 'bullish',
        confidencePct: 72,
        volatilityLevel: 'medium',
        description: 'Momentum is building across meme and mainstream markets.',
        recommendation: 'Consider scaling into top movers with tight risk.',
      },
    };
  }
}
