import { Controller, Post, Get, Body } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

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
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly configService: ConfigService,
  ) {}

  private getDemoUserId() {
    return (
      this.configService.get<string>('DEMO_USER_ID') ??
      '00000000-0000-0000-0000-000000000000'
    );
  }

  @Post('mint')
  @ApiOperation({ summary: '铸造预测票据' })
  async mint(@Body() body: MintDto) {
    return {
      success: true,
      data: await this.ticketsService.mintTickets(
        this.getDemoUserId(),
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
      data: await this.ticketsService.getUserTickets(this.getDemoUserId()), // 黑客松用固定用户
    };
  }
}
