-- AI 预测记录表
-- 在 Supabase 中执行以下 SQL

CREATE TABLE ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  prediction TEXT CHECK (prediction IN ('bullish', 'bearish', 'neutral')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  price_target_24h DECIMAL,
  current_price DECIMAL,
  signals TEXT[],
  risks TEXT[],
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 验证字段
  verified_at TIMESTAMPTZ,
  actual_price_24h DECIMAL,
  actual_result TEXT,
  accuracy_score INTEGER
);

-- 创建索引
CREATE INDEX idx_predictions_token ON ai_predictions(token_address);
CREATE INDEX idx_predictions_created ON ai_predictions(created_at DESC);
