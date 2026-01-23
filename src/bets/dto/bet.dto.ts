import { IsString, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareBetDto {
  @ApiProperty({
    description: '预测 ID',
    example: 'uuid-prediction-id',
  })
  @IsString()
  predictionId: string;

  @ApiProperty({
    description: 'Token 地址',
    example: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  })
  @IsString()
  tokenAddress: string;

  @ApiProperty({
    description: '下注方向',
    enum: ['bullish', 'bearish'],
    example: 'bullish',
  })
  @IsIn(['bullish', 'bearish'])
  betDirection: 'bullish' | 'bearish';

  @ApiProperty({
    description: '下注金额 (USDC)',
    minimum: 0.1,
    maximum: 100,
    example: 10,
  })
  @IsNumber()
  @Min(0.1)
  @Max(100)
  amount: number;

  @ApiProperty({
    description: '支付网络',
    enum: ['base', 'solana'],
    example: 'base',
  })
  @IsIn(['base', 'solana'])
  network: 'base' | 'solana';
}

export class ConfirmBetDto {
  @ApiProperty({
    description: '下注 ID',
    example: 'uuid-bet-id',
  })
  @IsString()
  betId: string;

  @ApiProperty({
    description: 'x402 支付签名',
    example: '0x...',
  })
  @IsString()
  paymentSignature: string;
}
