import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { PaymentsModule } from '../payments/payments.module';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletAuthGuard } from '../common/guards/wallet-auth.guard';

@Module({
  imports: [
    PaymentsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'crux-trade-secret-key-change-in-production',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [BetsController],
  providers: [BetsService, SupabaseService, WalletAuthGuard],
  exports: [BetsService],
})
export class BetsModule {}
