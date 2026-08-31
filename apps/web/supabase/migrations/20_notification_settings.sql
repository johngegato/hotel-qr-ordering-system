-- Migration 20: Notification Settings & Push Token Lifecycle Uniqueness
-- 1. Push Token Uniqueness on staff_users (allowing multiple NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_push_token_unique
ON staff_users(push_token)
WHERE push_token IS NOT NULL;

-- 2. Notification Settings Table
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL UNIQUE REFERENCES hotels(id) ON DELETE CASCADE,
  reminder_interval_minutes INT NOT NULL DEFAULT 5,
  enable_sound_alert BOOLEAN NOT NULL DEFAULT true,
  max_alert_duration_seconds INT NOT NULL DEFAULT 30,
  fnb_allowed_types TEXT[] NOT NULL DEFAULT ARRAY['FOOD_ORDER'],
  frontdesk_allowed_types TEXT[] NOT NULL DEFAULT ARRAY['CALL_REQUEST', 'TASK'],
  spa_allowed_types TEXT[] NOT NULL DEFAULT ARRAY['SPA_BOOKING'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_settings IS 'Global and role-based notification preferences per hotel';

-- 3. Default Seed for Default Hotel
INSERT INTO notification_settings (
  hotel_id,
  reminder_interval_minutes,
  enable_sound_alert,
  max_alert_duration_seconds,
  fnb_allowed_types,
  frontdesk_allowed_types,
  spa_allowed_types
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  5,
  true,
  30,
  ARRAY['FOOD_ORDER'],
  ARRAY['CALL_REQUEST', 'TASK'],
  ARRAY['SPA_BOOKING']
)
ON CONFLICT (hotel_id) DO NOTHING;

-- 4. Row Level Security
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Allow public / staff read
CREATE POLICY "Allow read notification_settings"
ON notification_settings
FOR SELECT
USING (true);

-- Allow authenticated updates
CREATE POLICY "Allow update notification_settings"
ON notification_settings
FOR ALL
USING (true)
WITH CHECK (true);
