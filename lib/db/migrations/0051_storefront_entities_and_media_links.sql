-- Migration 0051: Storefront entity linking
CREATE TABLE lunavo.storefront_section_links (
  id VARCHAR(40) PRIMARY KEY,
  page_id VARCHAR(40) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(40),
  section_index INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (page_id) REFERENCES lunavo.storefront_pages(id) ON DELETE CASCADE
);
