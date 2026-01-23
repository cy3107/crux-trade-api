import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';

class CreateOrderDto {
  marketId: string;
  direction: 'Up' | 'Down';
  orderType: 'Market' | 'Limit';
  limitPrice?: number;
  shares: number;
  paymentTxHash: string;
}

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
  ) {}

  private getDemoUserId() {
    return (
      this.configService.get<string>('DEMO_USER_ID') ??
      '00000000-0000-0000-0000-000000000000'
    );
  }

  @Post('orders')
  @ApiOperation({ summary: '下单（需要和合约交互）' })
  async createOrder(@Body() body: CreateOrderDto) {
    return {
      success: true,
      data: await this.ordersService.createOrder(this.getDemoUserId(), body),
    };
  }

  @Get('orders/me')
  @ApiOperation({ summary: '我的订单/持仓（列表）' })
  async getMyOrders(@Query('marketId') marketId?: string) {
    return {
      success: true,
      data: await this.ordersService.getOrders(this.getDemoUserId(), marketId),
    };
  }

  @Get('markets/:id/orderbook')
  @ApiOperation({ summary: '盘口（简化版）' })
  getOrderbook(@Param('id') _id: string) {
    return {
      success: true,
      data: {
        bids: [
          { price: 0.52, shares: 1200 },
          { price: 0.51, shares: 900 },
        ],
        asks: [
          { price: 0.54, shares: 1100 },
          { price: 0.55, shares: 750 },
        ],
      },
    };
  }

  @Get('markets/:id/price-history')
  @ApiOperation({ summary: '价格历史（简化版）' })
  getPriceHistory(@Param('id') _id: string) {
    return {
      success: true,
      data: [
        { time: '09:00', price: 0.49 },
        { time: '09:05', price: 0.5 },
        { time: '09:10', price: 0.52 },
      ],
    };
  }
}
