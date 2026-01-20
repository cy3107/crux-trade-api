import { IsString, IsOptional, IsIn, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeTokenDto {
  @ApiProperty({
    description: 'Token 合约地址',
    example: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  })
  @IsString()
  @Matches(/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/, {
    message: 'Invalid token address format',
  })
  tokenAddress: string;

  @ApiProperty({
    description: '区块链网络',
    enum: ['ethereum', 'bsc', 'solana', 'base'],
    default: 'ethereum',
    required: false,
  })
  @IsOptional()
  @IsIn(['ethereum', 'bsc', 'solana', 'base'])
  chain?: 'ethereum' | 'bsc' | 'solana' | 'base';
}
