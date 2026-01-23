import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectWalletDto {
  @ApiProperty({
    description: '钱包地址',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @IsString()
  walletAddress: string;

  @ApiProperty({
    description: '钱包类型',
    enum: ['evm', 'solana'],
    example: 'evm',
  })
  @IsIn(['evm', 'solana'])
  walletType: 'evm' | 'solana';
}

export class VerifyWalletDto {
  @ApiProperty({
    description: '会话 ID',
    example: 'uuid-session-id',
  })
  @IsString()
  sessionId: string;

  @ApiProperty({
    description: '钱包签名',
    example: '0x...',
  })
  @IsString()
  signature: string;
}
