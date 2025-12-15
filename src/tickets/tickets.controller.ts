import { Controller, Post, Get, Body } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

class MintDto {
  market_id: string;
  quantity?: number;
}

class ArmDto {
  ticket_ids: string[];
}

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('mint')
  @ApiOperation({ summary: '铸造预测票据' })
  async mint(@Body() body: MintDto) {
    return {
      success: true,
      data: await this.ticketsService.mintTickets(
        'demo-user',
        body.market_id,
        body.quantity || 1,
      ),
    };
  }

  @Post('arm')
  @ApiOperation({ summary: '武装票据（准备参与预测）' })
  async arm(@Body() body: ArmDto) {
    return {
      success: true,
      data: await this.ticketsService.armTickets(body.ticket_ids),
    };
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户票据状态' })
  async getMyTickets() {
    return {
      success: true,
      data: await this.ticketsService.getUserTickets('demo-user'), // 黑客松用固定用户
    };
  }
}
