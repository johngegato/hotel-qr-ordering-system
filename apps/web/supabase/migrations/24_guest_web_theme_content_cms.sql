-- ============================================================
-- Migration 24: Guest Web Dynamic Theme & Content CMS
-- Adds visual theme mode + custom colors + editable copy to
-- the hotels table so admins can restyle and rewrite the
-- guest web experience without code deploys.
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- 1. THEME MODE (preset id; 'CUSTOM' uses theme_config colors)
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'DARK_GOLD';

-- 2. CUSTOM / PRESET SURFACE COLORS (JSONB hex palette)
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS theme_config JSONB;

-- 3. GUEST-FACING COPY (JSONB, sectioned key-value dictionary)
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS content_config JSONB;