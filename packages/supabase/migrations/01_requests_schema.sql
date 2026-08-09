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
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'RESOLVED', 'CANCELLED')),
  payload       JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at    TIMESTAMPTZ,
  claimed_by    UUID
);

-- Indexes for fast queue lookups
CREATE INDEX IF NOT EXISTS idx_requests_hotel_id ON requests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_room_id ON requests(room_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

-- Enable Publication for Realtime (WebSockets)
ALTER PUBLICATION supabase_realtime ADD TABLE requests;

-- Enable Row Level Security (RLS)
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous access (guests & staff demo) to select, insert, and update requests
CREATE POLICY "Allow public read access to requests" ON requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to requests" ON requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to requests" ON requests FOR UPDATE USING (true);
