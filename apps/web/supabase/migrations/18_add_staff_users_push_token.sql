-- Add push_token column to staff_users to store native Android FCM / Expo push tokens
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_staff_users_push_token ON staff_users(push_token);
