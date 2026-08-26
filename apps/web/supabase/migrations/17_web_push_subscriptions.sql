-- ============================================================
-- Migration 17: Web Push Subscriptions for Staff PWA Alerts
-- Hotel QR Ordering System
--
-- Stores browser Web Push endpoints (FCM / APNs) registered
-- by staff devices running the Staff App PWA.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast lookups during request dispatch
CREATE INDEX IF NOT EXISTS idx_staff_push_sub_hotel_active
  ON staff_push_subscriptions(hotel_id, is_active);

CREATE INDEX IF NOT EXISTS idx_staff_push_sub_staff_user
  ON staff_push_subscriptions(staff_user_id);

-- Enable RLS
ALTER TABLE staff_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow public / staff to insert or update their own push subscriptions
DROP POLICY IF EXISTS "Allow staff to manage their push subscriptions" ON staff_push_subscriptions;
CREATE POLICY "Allow staff to manage their push subscriptions"
  ON staff_push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
