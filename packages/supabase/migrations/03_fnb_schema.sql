-- ============================================================
-- Phase 3: Food & Beverage Schema
-- Run this in Supabase SQL Editor AFTER 02_spa_schema.sql
-- ============================================================

-- ── 1. Extend catalog_items for F&B columns ──────────────────
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS category       TEXT,
  ADD COLUMN IF NOT EXISTS dietary_tags   TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order     INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_available   BOOLEAN DEFAULT TRUE;

-- ── 2. Ensure PREPARING & ESCALATED statuses exist ───────────
-- (requests.status is TEXT so no enum migration needed)

-- ── 3. Seed F&B catalog items ─────────────────────────────────
-- Hotel ID: 00000000-0000-0000-0000-000000000001 (Grand Hotel)

-- Breakfast
INSERT INTO catalog_items (id, hotel_id, department, category, name, description, price, dietary_tags, sort_order, is_available, image_url)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Breakfast', 'Classic Eggs Benedict',
   'Two poached eggs on English muffins with Canadian bacon and hollandaise sauce', 22.00,
   '{}', 1, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Breakfast', 'Avocado Toast',
   'Smashed avocado on sourdough with cherry tomatoes and feta cheese', 18.00,
   ARRAY['VEGETARIAN'], 2, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Breakfast', 'Açaí Bowl',
   'Blended açaí with granola, fresh berries, banana and honey drizzle', 16.00,
   ARRAY['VEGAN', 'GLUTEN_FREE'], 3, true, null),

-- Mains
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Mains', 'Grilled Wagyu Burger',
   'A5 wagyu beef patty, truffle aioli, aged cheddar, brioche bun, hand-cut fries', 38.00,
   '{}', 10, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Mains', 'Pan-Seared Salmon',
   'Atlantic salmon, lemon butter sauce, asparagus, roasted fingerling potatoes', 42.00,
   ARRAY['GLUTEN_FREE'], 11, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Mains', 'Truffle Risotto',
   'Carnaroli rice, black truffle, parmesan crisp, micro herbs', 34.00,
   ARRAY['VEGETARIAN', 'GLUTEN_FREE'], 12, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Mains', 'Lobster Linguine',
   'Boston lobster, cherry tomatoes, garlic white wine sauce, fresh herbs', 58.00,
   '{}', 13, true, null),

-- Starters & Sides
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Starters', 'Burrata & Heirloom Tomatoes',
   'Fresh burrata, heirloom tomatoes, basil oil, sea salt, sourdough crostini', 22.00,
   ARRAY['VEGETARIAN'], 20, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Starters', 'Shrimp Cocktail',
   'Chilled jumbo shrimp, house cocktail sauce, lemon', 28.00,
   ARRAY['GLUTEN_FREE'], 21, true, null),

-- Desserts
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Desserts', 'Warm Chocolate Fondant',
   'Dark chocolate lava cake, vanilla bean ice cream, salted caramel sauce', 18.00,
   ARRAY['VEGETARIAN'], 30, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Desserts', 'Crème Brûlée',
   'Classic vanilla custard, caramelised sugar crust, seasonal berries', 16.00,
   ARRAY['VEGETARIAN', 'GLUTEN_FREE'], 31, true, null),

-- Drinks
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Drinks', 'Fresh Pressed Juices',
   'Choose: Orange, Green Apple & Ginger, or Watermelon Mint', 12.00,
   ARRAY['VEGAN', 'GLUTEN_FREE'], 40, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Drinks', 'Signature Mocktail',
   'House-crafted non-alcoholic cocktail — ask for today''s selection', 14.00,
   ARRAY['VEGAN'], 41, true, null),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'F_AND_B', 'Drinks', 'Specialty Coffee',
   'Single-origin espresso, oat milk, choice of hot or iced', 10.00,
   ARRAY['VEGAN'], 42, true, null)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Enable Realtime on catalog_items (if not already) ──────
-- (Realtime was already enabled in 02_spa_schema.sql)

-- ── 5. RLS: Allow anonymous inserts to requests for food orders ─
-- (RLS policy already exists from 01_requests_schema.sql)
