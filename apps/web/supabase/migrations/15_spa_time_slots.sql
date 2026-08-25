-- ============================================================
-- Migration: 15_spa_time_slots.sql
-- Description: Dynamic Spa Time Slots Management
-- ============================================================

CREATE TABLE IF NOT EXISTS spa_time_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  slot_time     TEXT NOT NULL,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  is_on_call    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if table was already created earlier
ALTER TABLE spa_time_slots ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE spa_time_slots ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE spa_time_slots ADD COLUMN IF NOT EXISTS is_on_call BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_spa_time_slots_hotel ON spa_time_slots(hotel_id);
CREATE INDEX IF NOT EXISTS idx_spa_time_slots_available ON spa_time_slots(is_available);

-- Enable RLS with public policies
ALTER TABLE spa_time_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read spa_time_slots" ON spa_time_slots;
DROP POLICY IF EXISTS "Allow public all spa_time_slots"  ON spa_time_slots;
CREATE POLICY "Allow public read spa_time_slots" ON spa_time_slots FOR SELECT USING (true);
CREATE POLICY "Allow public all spa_time_slots"  ON spa_time_slots FOR ALL    USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE spa_time_slots;

-- Seed default initial slots for default hotel
INSERT INTO spa_time_slots (id, hotel_id, slot_time, is_available, is_on_call, sort_order)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10:00 AM', true, false, 1),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '11:30 AM', true, false, 2),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '01:00 PM', true, false, 3),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '02:30 PM', true, false, 4),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '04:00 PM', true, false, 5),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '05:30 PM', true, false, 6),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '07:00 PM', true, false, 7)
ON CONFLICT (id) DO UPDATE SET
  slot_time = EXCLUDED.slot_time,
  sort_order = EXCLUDED.sort_order;
