-- Migration 0001: Production hardening and core infrastructure
CREATE SCHEMA IF NOT EXISTS lunavo;

CREATE TABLE lunavo.schema_version (
  version INT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO lunavo.schema_version (version) VALUES (1);
