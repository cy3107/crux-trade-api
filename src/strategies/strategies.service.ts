import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SavedStrategy = {
  id: string;
  name: string;
  triggerToken: string;
  created_at: string;
};

@Injectable()
export class StrategiesService {
  constructor(private configService: ConfigService) {}

  async generateStrategy(prompt?: string, name?: string) {
    const useMock = this.configService.get<string>('USE_MOCK_AI') === 'true';

    if (useMock || !prompt) {
      return this.getMockStrategy(prompt, name);
    }

    return this.getMockStrategy(prompt, name);
  }

  private getMockStrategy(prompt?: string, name?: string) {
    // 根据 prompt 关键词智能选择不同 mock 策略
    const lowerPrompt = (prompt ?? '').toLowerCase();

    const mockStrategies = [
      {
        name: name || 'PEPE Trend Hunter',
        triggerToken: 'PEPE',
        timeframe: '1 hour',
        explanation:
          'AI detected strong social buzz spike (+35%) and whale inflows. Recommending aggressive long position with strict risk controls.',
        signals: [
          'Social sentiment spikes',
          'Whale inflows',
          'Volume increase',
        ],
        riskControls: ['Small position size', 'Pause during high volatility'],
        workflow: {
          nodes: [
            {
              id: '1',
              type: 'socialSentiment',
              label: 'Social Sentiment\nReal-time buzz',
            },
            {
              id: '2',
              type: 'onChainActivity',
              label: 'On-chain Activity\nWhale movements, hi',
            },
            {
              id: '3',
              type: 'riskControl',
              label: 'Risk Control\nPlaces trades & repct.',
            },
            {
              id: '4',
              type: 'onChainEvent',
              label: 'On-chain Event\n(Auto-Generated)',
            },
            {
              id: '5',
              type: 'executePrediction',
              label: 'Execute Prediction\nAuto-Settle',
            },
          ],
          edges: [
            { from: '1', to: '3' },
            { from: '2', to: '3' },
            { from: '3', to: '4' },
            { from: '4', to: '5' },
          ],
        },
      },
      {
        name: name || 'Risk Averse DOGE',
        triggerToken: 'DOGE',
        timeframe: '4 hours',
        explanation:
          'Conservative strategy focusing on low volatility entries with tight stop-loss and position sizing.',
        signals: [
          'Holder count rising',
          'Stable volume',
          'Low volatility periods',
        ],
        riskControls: [
          'Very small position',
          'Strict stop-loss',
          'Pause on news events',
        ],
        workflow: {
          nodes: [
            {
              id: '1',
              type: 'socialSentiment',
              label: 'Social Sentiment\nMonitor stability',
            },
            {
              id: '2',
              type: 'onChainActivity',
              label: 'On-chain Activity\nHolder growth',
            },
            {
              id: '3',
              type: 'riskControl',
              label: 'Risk Control\nTiny positions only',
            },
            {
              id: '4',
              type: 'executePrediction',
              label: 'Execute Prediction\nSafe entry only',
            },
          ],
          edges: [
            { from: '1', to: '3' },
            { from: '2', to: '3' },
            { from: '3', to: '4' },
          ],
        },
      },
      {
        name: name || 'Shiba Moon Shot',
        triggerToken: 'SHIB',
        timeframe: '30 mins',
        explanation:
          'High-risk high-reward strategy triggered by sudden volume and sentiment explosion.',
        signals: [
          'Extreme buzz surge',
          'Rapid volume spike',
          'FOMO indicators',
        ],
        riskControls: ['Quick take-profit', 'Hard stop-loss', 'One-shot entry'],
        workflow: {
          nodes: [
            {
              id: '1',
              type: 'socialSentiment',
              label: 'Social Sentiment\nExtreme spike detect',
            },
            {
              id: '2',
              type: 'onChainActivity',
              label: 'On-chain Activity\nVolume explosion',
            },
            {
              id: '3',
              type: 'riskControl',
              label: 'Risk Control\nOne-shot trade',
            },
            {
              id: '4',
              type: 'executePrediction',
              label: 'Execute Prediction\nFast settle',
            },
          ],
          edges: [
            { from: '1', to: '2' },
            { from: '2', to: '3' },
            { from: '3', to: '4' },
          ],
        },
      },
    ];

    // 智能匹配：包含 token 名称的优先
    const tokenMatch = mockStrategies.find((s) =>
      lowerPrompt.includes(s.triggerToken.toLowerCase()),
    );
    if (tokenMatch) return tokenMatch;

    // 风险偏好匹配
    if (
      lowerPrompt.includes('risk') ||
      lowerPrompt.includes('safe') ||
      lowerPrompt.includes('conservative')
    ) {
      return mockStrategies[1];
    }

    // 默认返回最炫酷的 PEPE 策略
    return mockStrategies[0];
  }

  async getSavedStrategies(_userId: string): Promise<SavedStrategy[]> {
    return [
      {
        id: '1',
        name: 'PEPE Trend Hunter',
        triggerToken: 'PEPE',
        created_at: '2025-12-15T08:00:00.000Z',
      },
      {
        id: '2',
        name: 'Risk Averse DOGE',
        triggerToken: 'DOGE',
        created_at: '2025-12-14T08:00:00.000Z',
      },
    ];
  }

  async saveStrategy(_userId: string, payload: { strategy: any; name?: string }) {
    return {
      id: `saved-${Date.now()}`,
      ...payload,
      saved_at: new Date().toISOString(),
    };
  }
}
