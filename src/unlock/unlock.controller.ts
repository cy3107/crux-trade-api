import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { UnlockService } from './unlock.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

class UnlockDto {
  marketId: string;
}

@ApiTags('unlock')
@Controller('markets')
export class UnlockController {
  constructor(
    private readonly unlockService: UnlockService,
    private readonly configService: ConfigService,
  ) {}

  private getDemoUserId() {
    return (
      this.configService.get<string>('DEMO_USER_ID') ??
      '00000000-0000-0000-0000-000000000000'
    );
  }

  @Post('unlock')
  @ApiOperation({ summary: '解锁市场高级内容（Top-3 Unlock 0.5 USDC）' })
  async unlock(@Body() body: UnlockDto) {
    const marketId = body.marketId;
    if (!marketId) {
      throw new BadRequestException('marketId is required');
    }
    // 黑客松模拟：假设用户已支付，直接解锁
    return {
      success: true,
      data: await this.unlockService.unlockMarket(marketId),
    };
  }
}
