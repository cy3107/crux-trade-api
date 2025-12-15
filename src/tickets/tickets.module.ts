import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, SupabaseService],
})
export class TicketsModule {}
