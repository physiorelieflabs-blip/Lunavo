-- Migration 0026: Permissions table
CREATE TABLE lunavo.permissions (
  id VARCHAR(40) PRIMARY KEY,
  permission_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  resource_type VARCHAR(50),
  action VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lunavo.role_permissions (
  id VARCHAR(40) PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_id VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (permission_id) REFERENCES lunavo.permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id)
);
