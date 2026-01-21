import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PostgrestError } from '@supabase/supabase-js';

@Injectable()
export class UnlockService {
  constructor(private supabaseService: SupabaseService) {}

  async unlockMarket(marketId: string) {
    // 黑客松简化：直接把 unlock_progress_pct 设为 100
    const { error }: { error: PostgrestError | null } =
      await this.supabaseService
        .getClient()
        .from('markets')
        .update({ unlock_progress_pct: 100 })
        .eq('id', marketId);

    if (error) {
      throw new Error(`Unlock failed: ${error.message}`);
    }

    // 记录用户解锁历史（可选表 user_unlocks）
    return { unlocked: true, marketId };
  }
}
