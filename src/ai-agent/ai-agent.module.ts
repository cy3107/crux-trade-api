import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AiEngineService } from './ai-engine.service';
import { Web3DataProvider } from './providers/web3-data.provider';
import { SocialDataProvider } from './providers/social-data.provider';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { CryptoPanicProvider } from './providers/cryptopanic.provider';
import { RedditProvider } from './providers/reddit.provider';
import { MarketIntelligenceService } from './market-intelligence.service';
import { AiAgentScheduler } from './ai-agent.scheduler';
import { SupabaseService } from '../common/supabase/supabase.service';
import { StrategiesService } from '../strategies/strategies.service';
import { ApiKeyGuard, RateLimitGuard } from '../common/guards';

@Module({
  controllers: [AiAgentController],
  providers: [
    // 认证和限流守卫
    ApiKeyGuard,
    RateLimitGuard,

    // 核心服务
    AiAgentService,
    AiEngineService,
    MarketIntelligenceService,

    // 数据提供者
    Web3DataProvider,
    SocialDataProvider,
    CoinGeckoProvider,
    CryptoPanicProvider,
    RedditProvider,

    // 调度器和外部服务
    AiAgentScheduler,
    SupabaseService,
    StrategiesService,
  ],
  exports: [AiAgentService, MarketIntelligenceService],
})
export class AiAgentModule {}
