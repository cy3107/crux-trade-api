import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { BetsService } from './bets.service';
import { PrepareBetDto, ConfirmBetDto } from './dto/bet.dto';
import { WalletAuthGuard } from '../common/guards/wallet-auth.guard';
import { Wallet } from '../common/decorators/wallet.decorator';
import type { WalletInfo } from '../common/decorators/wallet.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('Bets')
@Controller('bets')
export class BetsController {
  constructor(private betsService: BetsService) {}

  @Post('prepare')
  @UseGuards(WalletAuthGuard)
  @RateLimit({ limit: 10, windowMs: 60 * 1000 })
  @ApiBearerAuth()
  @ApiOperation({
    summary: '准备下注',
    description: '创建下注记录并返回 x402 支付要求 (HTTP 402)',
  })
  @ApiResponse({
    status: 402,
    description: '返回支付要求',
    headers: {
      'X-Payment-Required': {
        description: 'x402 支付要求 JSON',
        schema: { type: 'string' },
      },
    },
  })
  async prepareBet(
    @Body() dto: PrepareBetDto,
    @Wallet() wallet: WalletInfo,
    @Res() res: Response,
  ) {
    const result = await this.betsService.prepareBet(
      wallet.address,
      wallet.type,
      dto.predictionId,
      dto.tokenAddress,
      dto.betDirection,
      dto.amount,
      dto.network,
    );

    // 返回 402 Payment Required
    res
      .status(HttpStatus.PAYMENT_REQUIRED)
      .header('X-Payment-Required', JSON.stringify(result.paymentRequired))
      .json({
        statusCode: 402,
        message: 'Payment Required',
        betId: result.betId,
        paymentRequired: result.paymentRequired,
        betDetails: result.betDetails,
      });
  }

  @Post('confirm')
  @UseGuards(WalletAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '确认下注',
    description: '提交 x402 支付签名确认下注',
  })
  @ApiHeader({
    name: 'X-Payment-Signature',
    description: 'x402 支付签名',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: '下注确认成功',
    schema: {
      properties: {
        success: { type: 'boolean' },
        bet: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            txHash: { type: 'string' },
            potentialPayout: { type: 'number' },
          },
        },
      },
    },
  })
  async confirmBet(
    @Body() dto: ConfirmBetDto,
    @Wallet() wallet: WalletInfo,
  ) {
    return this.betsService.confirmBet(
      dto.betId,
      wallet.address,
      dto.paymentSignature,
    );
  }

  @Get('me')
  @UseGuards(WalletAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的下注记录' })
  @ApiResponse({
    status: 200,
    description: '返回下注列表',
    schema: {
      type: 'array',
      items: {
        properties: {
          id: { type: 'string' },
          tokenSymbol: { type: 'string' },
          betDirection: { type: 'string' },
          amount: { type: 'number' },
          odds: { type: 'number' },
          potentialPayout: { type: 'number' },
          betStatus: { type: 'string' },
          paymentStatus: { type: 'string' },
        },
      },
    },
  })
  async getMyBets(@Wallet() wallet: WalletInfo) {
    return this.betsService.getMyBets(wallet.address);
  }

  @Get(':id')
  @UseGuards(WalletAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取下注详情' })
  @ApiResponse({
    status: 200,
    description: '返回下注详情和关联的预测',
  })
  async getBetById(
    @Param('id') id: string,
    @Wallet() wallet: WalletInfo,
  ) {
    return this.betsService.getBetById(id, wallet.address);
  }
}
