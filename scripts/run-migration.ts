import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
const supabaseUrl = 'https://wvsgyqhnhjzbbydiiofr.supabase.co';
const serviceRoleKey = 'sb_secret_jll3RkvLMWo4WQ9kucRCxQ_iFx3-OuU';
const sql = `select * from ai_predictions;`
const sql1 = `
-- 先执行这个（只需要一次）
  CREATE OR REPLACE FUNCTION exec_sql(query text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    EXECUTE query;
  END;
  $$;

  -- 然后执行这个创建表
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
    verified_at TIMESTAMPTZ,
    actual_price_24h DECIMAL,
    actual_result TEXT,
    accuracy_score INTEGER
  );

  CREATE INDEX idx_predictions_token ON ai_predictions(token_address);
  CREATE INDEX idx_predictions_created ON ai_predictions(created_at DESC);
`
const supabase = createClient(supabaseUrl, serviceRoleKey);
// 加载环境变量
dotenv.config();

async function runMigration() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('错误: SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未配置');
    process.exit(1);
  }
  
    const client = new Client({
      host: 'db.wvsgyqhnhjzbbydiiofr.supabase.co',  // 从项目设置获取
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'BUvb@X&Q7YsKYST',  // 注意：这是数据库密码，不是 anon key
    })

  await client.connect()
  try {
    // 执行原生 SQL
    const res = await client.query(sql)
    console.log('正在执行 SQL 迁移...', res);
  } catch (error) {
    // 继续尝试其他方式
    console.log(error);
    
  } finally {
    await client.end()
    console.log('\n✅ 数据库连接已关闭')
  }

  // 方案2: 输出 SQL 让用户手动执行
  console.log('\n' + '='.repeat(60));
  console.log('自动执行失败，请在 Supabase SQL Editor 中手动执行以下 SQL:');
  console.log('='.repeat(60) + '\n');
  console.log('\n' + '='.repeat(60));
  console.log('步骤:');
  console.log('1. 打开 https://supabase.com/dashboard');
  console.log('2. 选择项目 > SQL Editor > New query');
  console.log('3. 粘贴上面的 SQL 并点击 Run');
  console.log('='.repeat(60));
}

runMigration();
