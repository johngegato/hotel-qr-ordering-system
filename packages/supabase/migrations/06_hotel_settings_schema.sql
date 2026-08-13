-- ============================================================
-- Phase 6: Hotel Settings & Branding Schema
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. ADD COLOR_SCHEME TO HOTELS TABLE
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS color_scheme TEXT DEFAULT 'gold';

-- 2. UPDATE DEFAULT SEED DATA FOR GRAND HOTEL
UPDATE hotels
SET 
  phone = COALESCE(phone, '+1-800-555-0100'),
  logo_url = COALESCE(logo_url, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=120'),
  color_scheme = COALESCE(color_scheme, 'gold')
WHERE id = '00000000-0000-0000-0000-000000000001';
