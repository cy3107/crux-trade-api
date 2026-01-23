import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

class QuoteRequestDto {
  marketId: string;
  direction: 'Up' | 'Down';
  orderType: 'Market' | 'Limit';
  limitPrice?: number;
  shares: number;
  token: string;
}

class ConfirmRequestDto {
  quoteId: string;
  txHash: string;
}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/x402/quote')
  @ApiOperation({ summary: '生成 X402 支付报价' })
  async quote(@Body() body: QuoteRequestDto) {
    return {
      success: true,
      data: await this.paymentsService.createQuote(body),
    };
  }

  @Post('payments/x402/confirm')
  @ApiOperation({ summary: '确认 X402 支付' })
  async confirm(@Body() body: ConfirmRequestDto) {
    return {
      success: true,
      data: {
        status: 'paid',
        txHash: (await this.paymentsService.confirmPayment(body.quoteId, body.txHash))
          .txHash,
      },
    };
  }
}
