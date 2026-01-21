import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseService } from './common/supabase/supabase.service';
import { MarketsModule } from './markets/markets.module';
import { UnlockModule } from './unlock/unlock.module';
import { TicketsModule } from './tickets/tickets.module';
import { ArenaController } from './arena/arena.controller';
import { StrategiesModule } from './strategies/strategies.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { InsightsController } from './insights/insights.controller';
import { SettlementsController } from './settlements/settlements.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MarketsModule,
    UnlockModule,
    TicketsModule,
    StrategiesModule,
    AiAgentModule,
  ],
  providers: [SupabaseService],
  exports: [SupabaseService],
  controllers: [ArenaController, InsightsController, SettlementsController],
})
export class AppModule {}
