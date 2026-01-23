import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { ConnectWalletDto, VerifyWalletDto } from './dto/connect-wallet.dto';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Post('connect')
  @ApiOperation({ summary: '发起钱包连接', description: '返回 challenge 消息供钱包签名' })
  @ApiResponse({
    status: 200,
    description: '返回会话ID和待签名消息',
    schema: {
      properties: {
        sessionId: { type: 'string' },
        challenge: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  })
  async connect(@Body() dto: ConnectWalletDto) {
    return this.walletService.connect(dto.walletAddress, dto.walletType);
  }

  @Post('verify')
  @ApiOperation({ summary: '验证钱包签名', description: '验证签名后返回 JWT token' })
  @ApiResponse({
    status: 200,
    description: '验证成功，返回 session token',
    schema: {
      properties: {
        sessionToken: { type: 'string' },
        walletAddress: { type: 'string' },
        walletType: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  })
  async verify(@Body() dto: VerifyWalletDto) {
    return this.walletService.verify(dto.sessionId, dto.signature);
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前会话信息' })
  @ApiResponse({
    status: 200,
    description: '返回当前钱包会话信息',
    schema: {
      properties: {
        walletAddress: { type: 'string' },
        walletType: { type: 'string' },
        isVerified: { type: 'boolean' },
      },
    },
  })
  async getSession(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证 token');
    }
    const token = authHeader.substring(7);
    return this.walletService.getSession(token);
  }
}
