-- ============================================================
-- Phase 3+: Dedicated Menu Categories & Storage Support
-- Migration: 13_menu_categories_and_storage.sql
-- ============================================================

-- ── 1. Create menu_categories table ───────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🍽️',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_menu_categories_hotel_name UNIQUE(hotel_id, name)
);

-- Index for performant lookup & sort
CREATE INDEX IF NOT EXISTS idx_menu_categories_hotel_sort ON menu_categories(hotel_id, sort_order, name);

-- ── 2. Enable Realtime on menu_categories ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_categories;
  END IF;
END $$;

-- ── 3. Enable RLS on menu_categories ─────────────────────────
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read menu_categories" ON menu_categories;
DROP POLICY IF EXISTS "Allow public all menu_categories" ON menu_categories;

CREATE POLICY "Allow public read menu_categories" ON menu_categories FOR SELECT USING (true);
CREATE POLICY "Allow public all menu_categories" ON menu_categories FOR ALL USING (true);

-- ── 4. Seed Default Menu Categories ──────────────────────────
-- Hotel ID: 00000000-0000-0000-0000-000000000001 (Grand Hotel)
INSERT INTO menu_categories (id, hotel_id, name, icon, sort_order, is_active)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Breakfast', '🍳', 1, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Starters', '🥗', 2, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Mains', '🥩', 3, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Desserts', '🍰', 4, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Drinks', '🍹', 5, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Other', '🍽️', 99, true)
ON CONFLICT (hotel_id, name) DO NOTHING;

-- ── 5. Ensure catalog_items and menu_catalog have image_url ──
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS image_url TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'menu_catalog') THEN
    ALTER TABLE menu_catalog ADD COLUMN IF NOT EXISTS image_url TEXT;
  END IF;
END $$;
