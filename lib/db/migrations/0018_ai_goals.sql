-- Migration 0018: AI store goals and strategy
CREATE TABLE lunavo.ai_store_goals (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40),
  merchant_id VARCHAR(40) NOT NULL,
  goal_type VARCHAR(100) NOT NULL,
  target_value DECIMAL(14, 2),
  current_value DECIMAL(14, 2),
  progress_percent DECIMAL(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
