import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatInputDto {
  @ApiProperty({
    description: '用户输入的内容（Token 地址或查询文本）',
    example: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  })
  @IsString()
  @MinLength(1, { message: '输入不能为空' })
  @MaxLength(500, { message: '输入内容过长' })
  input: string;

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

/**
 * 流式事件类型
 */
export interface StreamEvent {
  type: 'progress' | 'content' | 'error' | 'done';
  data: {
    stage?: string;
    progress?: number;
    message?: string;
    content?: string;
    error?: string;
    result?: any;
  };
}
