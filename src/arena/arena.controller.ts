import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('arena')
@Controller('arena')
export class ArenaController {
  private mockBattle = {
    status: 'in_progress',
    timeRemaining: '02:34:12',
    winRatePct: 68,
    totalBattles: 24,
    rank: 142,
  };

  @Get('me')
  @ApiOperation({ summary: '获取用户 Arena 对战状态' })
  getMyArena() {
    return { success: true, data: this.mockBattle };
  }

  @Post('enter')
  @ApiOperation({ summary: '进入 Arena 对战' })
  enterArena() {
    return { success: true, message: 'Entered arena with armed tickets' };
  }
}
