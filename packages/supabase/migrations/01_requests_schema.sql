-- ============================================================
-- Phase 1: Requests Schema & Realtime Setup
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Create Requests Table
CREATE TABLE IF NOT EXISTS requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  request_type  TEXT NOT NULL DEFAULT 'CALL_REQUEST',
  status        TEXT NOT NULL DEFAULT 'PENDING',
  payload       JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at    TIMESTAMPTZ,
  claimed_by    UUID
);

-- Drop old CHECK constraint and add expanded one (idempotent: DROP IF EXISTS works in PG 9.4+)
DO $$ BEGIN
  ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
  ALTER TABLE requests ADD CONSTRAINT requests_status_check
    CHECK (status IN (
      'PENDING',
      'PENDING_ON_CALL',
      'CLAIMED',
      'CONFIRMED',
      'DECLINED',
      'PREPARING',
      'RESOLVED',
      'ESCALATED_L1',
      'CANCELLED'
    ));
EXCEPTION WHEN others THEN
  NULL; -- table may not exist yet on first run, CREATE TABLE above handles it
END $$;

-- Indexes for fast queue lookups
CREATE INDEX IF NOT EXISTS idx_requests_hotel_id ON requests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_room_id ON requests(room_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

-- Enable Publication for Realtime (WebSockets) — idempotent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE requests;
  END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous access (guests & staff demo) — idempotent
DROP POLICY IF EXISTS "Allow public read access to requests"   ON requests;
DROP POLICY IF EXISTS "Allow public insert access to requests" ON requests;
DROP POLICY IF EXISTS "Allow public update access to requests" ON requests;
CREATE POLICY "Allow public read access to requests"   ON requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to requests" ON requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to requests" ON requests FOR UPDATE USING (true);
