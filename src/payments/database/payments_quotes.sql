-- X402 支付报价表
-- 在 Supabase 中执行以下 SQL

CREATE TABLE IF NOT EXISTS payments_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  market_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  order_type TEXT NOT NULL,
  limit_price NUMERIC,
  shares NUMERIC NOT NULL,
  token TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  spender TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  tx_chain_id INTEGER NOT NULL,
  tx_from TEXT NOT NULL,
  tx_to TEXT NOT NULL,
  tx_data TEXT NOT NULL,
  tx_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'quoted',
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_quotes_quote_id ON payments_quotes(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_quotes_tx_hash ON payments_quotes(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payments_quotes_status ON payments_quotes(status);
CREATE INDEX IF NOT EXISTS idx_payments_quotes_user_id ON payments_quotes(user_id);
