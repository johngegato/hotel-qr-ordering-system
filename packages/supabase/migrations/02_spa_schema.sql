-- ============================================================
-- Phase 2: Spa Booking & Therapist Management Schema
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. CATALOG ITEMS TABLE (Shared for Spa, F&B, Room Requests)
CREATE TABLE IF NOT EXISTS catalog_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id          UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  department        TEXT NOT NULL DEFAULT 'SPA' CHECK (department IN ('SPA', 'F_AND_B', 'ROOM_REQUEST')),
  name              TEXT NOT NULL,
  description       TEXT,
  price             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  duration_mins     INT DEFAULT 60,
  requires_on_call  BOOLEAN NOT NULL DEFAULT FALSE,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  image_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_hotel_dept ON catalog_items(hotel_id, department);
CREATE INDEX IF NOT EXISTS idx_catalog_items_available ON catalog_items(is_available);

-- 2. THERAPISTS TABLE
CREATE TABLE IF NOT EXISTS therapists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  is_on_call  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_therapists_hotel_id ON therapists(hotel_id);

-- 3. SPA SLOT LOCKS TABLE
CREATE TABLE IF NOT EXISTS spa_slot_locks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  therapist_id  UUID REFERENCES therapists(id) ON DELETE SET NULL,
  session_id    UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'BOOKED', 'EXPIRED', 'CANCELLED')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_slot_locks_hotel ON spa_slot_locks(hotel_id);
CREATE INDEX IF NOT EXISTS idx_spa_slot_locks_status ON spa_slot_locks(status);
CREATE INDEX IF NOT EXISTS idx_spa_slot_locks_time ON spa_slot_locks(start_time, end_time);

-- Enable Publication for Realtime (WebSockets) — idempotent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'catalog_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog_items;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'therapists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE therapists;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'spa_slot_locks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE spa_slot_locks;
  END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE spa_slot_locks ENABLE ROW LEVEL SECURITY;

-- Allow public read & write for demo purposes (idempotent)
DROP POLICY IF EXISTS "Allow public read catalog_items" ON catalog_items;
DROP POLICY IF EXISTS "Allow public all catalog_items"  ON catalog_items;
CREATE POLICY "Allow public read catalog_items" ON catalog_items FOR SELECT USING (true);
CREATE POLICY "Allow public all catalog_items"  ON catalog_items FOR ALL    USING (true);

DROP POLICY IF EXISTS "Allow public read therapists" ON therapists;
DROP POLICY IF EXISTS "Allow public all therapists"  ON therapists;
CREATE POLICY "Allow public read therapists" ON therapists FOR SELECT USING (true);
CREATE POLICY "Allow public all therapists"  ON therapists FOR ALL    USING (true);

DROP POLICY IF EXISTS "Allow public read spa_slot_locks" ON spa_slot_locks;
DROP POLICY IF EXISTS "Allow public all spa_slot_locks"  ON spa_slot_locks;
CREATE POLICY "Allow public read spa_slot_locks" ON spa_slot_locks FOR SELECT USING (true);
CREATE POLICY "Allow public all spa_slot_locks"  ON spa_slot_locks FOR ALL    USING (true);

-- ============================================================
-- SEED DATA FOR SPA & THERAPISTS
-- ============================================================

-- Insert Spa Treatments into catalog_items
INSERT INTO catalog_items (id, hotel_id, department, name, description, price, duration_mins, requires_on_call, is_available, image_url)
VALUES 
(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'SPA',
  'Deep Tissue Massage',
  'Intense muscle therapy using deep pressure to relieve tension and chronic stiffness.',
  120.00,
  60,
  FALSE,
  TRUE,
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=500&q=80'
),
(
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'SPA',
  'Aromatherapy Wellness Massage',
  'Gentle soothing massage with essential oils curated for ultimate relaxation and stress relief.',
  140.00,
  75,
  FALSE,
  TRUE,
  'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?w=500&q=80'
),
(
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'SPA',
  'Hot Stone Signature Therapy',
  'Warm basalt stones combined with targeted massage techniques to ease muscle soreness.',
  160.00,
  90,
  TRUE,
  TRUE,
  'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=500&q=80'
)
ON CONFLICT (id) DO NOTHING;

-- Insert Therapists
INSERT INTO therapists (id, hotel_id, full_name, is_on_call, is_active)
VALUES
(
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Elena Rostova (In-House Senior)',
  FALSE,
  TRUE
),
(
  '20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Marcus Vance (On-Call Specialist)',
  TRUE,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
