INSERT INTO merchant_role_permissions (role_id, permission)
SELECT id, 'customers.manage'
FROM merchant_roles
WHERE key IN ('owner', 'admin', 'manager')
ON CONFLICT (role_id, permission) DO NOTHING;