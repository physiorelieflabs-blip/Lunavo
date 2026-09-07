ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_selected_at timestamptz;