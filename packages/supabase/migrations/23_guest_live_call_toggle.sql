-- Migration 23: Guest Live Voice Call Visibility Toggle
-- Adds an admin-controlled boolean to notification_settings that shows/hides
-- the "Live Voice Call" (Agora RTC) button in the guest web Call Front Desk modal.

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS enable_guest_live_call BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN notification_settings.enable_guest_live_call IS 'When FALSE, the Live Voice Call button is hidden on the guest web portal';

-- Backfill existing rows to the default (visible)
UPDATE notification_settings
SET enable_guest_live_call = COALESCE(enable_guest_live_call, TRUE)
WHERE enable_guest_live_call IS NULL;
