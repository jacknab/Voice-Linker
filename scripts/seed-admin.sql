-- Seed: default admin account
-- Run after db:push to create the admin login.
-- Password: 1825Logan!  (bcrypt hash below)

INSERT INTO admin_accounts (id, email, password_hash, created_at)
VALUES (
  gen_random_uuid(),
  'admin@me.com',
  '$2b$12$V8LqYrD.8YZMkyfBnZ/b5u3dGhC/Os3rpPeoOAHp/TNrC11lZ10nC',
  NOW()
)
ON CONFLICT (email) DO NOTHING;
