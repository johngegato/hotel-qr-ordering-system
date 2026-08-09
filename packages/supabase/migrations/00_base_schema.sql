-- ============================================================
-- Phase 0: Base Multi-Tenant Schema
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- HOTELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS hotels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_created_at ON hotels(created_at);

-- ============================================================
-- ROOMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_number   TEXT NOT NULL,
  floor         TEXT,
  room_type     TEXT DEFAULT 'STANDARD',
  qr_auth_hash  TEXT UNIQUE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_rooms_qr_auth_hash ON rooms(qr_auth_hash);

-- ============================================================
-- GUEST SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS guest_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  phone_number  TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CHECKED_OUT')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_room_id ON guest_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_hotel_id ON guest_sessions(hotel_id);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_status ON guest_sessions(status);

-- ============================================================
-- SEED DATA
-- ============================================================
-- Insert Grand Hotel
INSERT INTO hotels (id, name, address, phone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Grand Hotel',
  '1 Grand Avenue, Luxury District',
  '+1-800-555-0100'
)
ON CONFLICT (id) DO NOTHING;

-- Insert Room 302
INSERT INTO rooms (id, hotel_id, room_number, floor, room_type, qr_auth_hash)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '302',
  '3',
  'DELUXE',
  'secret-hash-302'
)
ON CONFLICT (id) DO NOTHING;

-- Insert Room 101 (bonus seed)
INSERT INTO rooms (id, hotel_id, room_number, floor, room_type, qr_auth_hash)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  '101',
  '1',
  'STANDARD',
  'secret-hash-101'
)
ON CONFLICT (id) DO NOTHING;
