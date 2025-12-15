import { Module } from '@nestjs/common';
import { UnlockController } from './unlock.controller';
import { UnlockService } from './unlock.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Module({
  controllers: [UnlockController],
  providers: [UnlockService, SupabaseService],
})
export class UnlockModule {}
