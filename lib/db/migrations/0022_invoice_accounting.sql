-- Migration 0022: Invoice line items
CREATE TABLE lunavo.invoice_line_items (
  id VARCHAR(40) PRIMARY KEY,
  invoice_id VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  quantity INT DEFAULT 1,
  unit_price DECIMAL(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (invoice_id) REFERENCES lunavo.invoices(id) ON DELETE CASCADE
);
