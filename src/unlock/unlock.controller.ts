import { Controller, Post, Body } from '@nestjs/common';
import { UnlockService } from './unlock.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

class UnlockDto {
  market_id: string;
}

@ApiTags('unlock')
@Controller('markets')
export class UnlockController {
  constructor(private readonly unlockService: UnlockService) {}

  @Post('unlock')
  @ApiOperation({ summary: '解锁市场高级内容（Top-3 Unlock 0.5 USDC）' })
  async unlock(@Body() body: UnlockDto) {
    // 黑客松模拟：假设用户已支付，直接解锁
    return {
      success: true,
      data: await this.unlockService.unlockMarket(body.market_id, 'demo-user'),
    };
  }
}
