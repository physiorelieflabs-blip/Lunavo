-- Migration 0009: AI actions and control room
CREATE TABLE lunavo.ai_actions (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40),
  action_type VARCHAR(100) NOT NULL,
  proposed_action TEXT NOT NULL,
  reason TEXT,
  input_evidence JSONB,
  confidence DECIMAL(3, 2),
  risk_level VARCHAR(50),
  approval_status VARCHAR(50) DEFAULT 'pending',
  execution_result JSONB,
  rollback_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_actions_merchant_id ON lunavo.ai_actions(merchant_id);
CREATE INDEX idx_ai_actions_approval_status ON lunavo.ai_actions(approval_status);
