-- Migration 0029: Auction system
CREATE TABLE lunavo.auctions (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40),
  seller_merchant_id VARCHAR(40) NOT NULL,
  auction_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  currency_code VARCHAR(3) NOT NULL,
  starting_price DECIMAL(14, 2) NOT NULL,
  floor_price DECIMAL(14, 2),
  current_high_bid DECIMAL(14, 2) DEFAULT 0,
  current_high_bidder_id VARCHAR(40),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  total_bids INT DEFAULT 0,
  settled_at TIMESTAMPTZ,
  settled_transaction_id VARCHAR(40),
  winning_bid_id VARCHAR(40),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (seller_merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_auctions_seller_merchant_id ON lunavo.auctions(seller_merchant_id);
CREATE INDEX idx_auctions_status ON lunavo.auctions(status);
CREATE INDEX idx_auctions_end_time ON lunavo.auctions(end_time);

CREATE TABLE lunavo.auction_bids (
  id VARCHAR(40) PRIMARY KEY,
  auction_id VARCHAR(40) NOT NULL,
  bidder_merchant_id VARCHAR(40),
  bidder_id VARCHAR(40),
  bid_amount DECIMAL(14, 2) NOT NULL,
  bid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_winning BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (auction_id) REFERENCES lunavo.auctions(id) ON DELETE CASCADE
);

CREATE INDEX idx_auction_bids_auction_id ON lunavo.auction_bids(auction_id);
CREATE INDEX idx_auction_bids_bidder_id ON lunavo.auction_bids(bidder_id);
