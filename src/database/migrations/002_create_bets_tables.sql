-- 钱包会话表
CREATE TABLE IF NOT EXISTS wallet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('evm', 'solana')),
  challenge_message TEXT NOT NULL,
  signature TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  session_token TEXT UNIQUE,
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_sessions_address ON wallet_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_sessions_token ON wallet_sessions(session_token) WHERE is_verified = TRUE;

-- 下注表
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 用户信息
  user_wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('evm', 'solana')),

  -- 关联预测
  prediction_id UUID,
  token_address TEXT NOT NULL,
  token_symbol TEXT,

  -- 下注信息
  bet_direction TEXT NOT NULL CHECK (bet_direction IN ('bullish', 'bearish')),
  bet_amount DECIMAL NOT NULL CHECK (bet_amount >= 0.1 AND bet_amount <= 100),
  bet_currency TEXT NOT NULL DEFAULT 'USDC',

  -- AI 预测快照
  ai_prediction TEXT NOT NULL CHECK (ai_prediction IN ('bullish', 'bearish', 'neutral')),
  ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  ai_price_target_24h DECIMAL,
  entry_price DECIMAL NOT NULL,

  -- 赔率
  odds DECIMAL NOT NULL DEFAULT 1.95,
  potential_payout DECIMAL NOT NULL,

  -- 支付信息
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'processing', 'confirmed', 'failed', 'refunded')),
  payment_network TEXT NOT NULL CHECK (payment_network IN ('base', 'solana')),
  payment_tx_hash TEXT,
  payment_nonce TEXT UNIQUE,

  -- 结算信息
  bet_status TEXT NOT NULL DEFAULT 'active'
    CHECK (bet_status IN ('active', 'won', 'lost', 'cancelled', 'expired')),
  settlement_price DECIMAL,
  settlement_time TIMESTAMPTZ,
  settlement_tx_hash TEXT,
  payout_amount DECIMAL,

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_wallet ON bets(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_bets_token ON bets(token_address);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(bet_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_bets_created ON bets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_expires ON bets(expires_at) WHERE bet_status = 'active';
