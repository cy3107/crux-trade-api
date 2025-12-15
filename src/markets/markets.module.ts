import { Module } from '@nestjs/common';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Module({
  controllers: [MarketsController],
  providers: [MarketsService, SupabaseService],
})
export class MarketsModule {}
