-- ── 07_menu_catalog_schema.sql ──────────────────────────────────────────
-- Dedicated Menu Catalog table for F&B/Dining ordering & staff management

CREATE TABLE IF NOT EXISTS menu_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL,
  is_available BOOLEAN DEFAULT true,
  image_url TEXT,
  dietary_tags TEXT[] DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performant lookup & filtering
CREATE INDEX IF NOT EXISTS idx_menu_catalog_hotel ON menu_catalog(hotel_id, category);
CREATE INDEX IF NOT EXISTS idx_menu_catalog_available ON menu_catalog(is_available);

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_catalog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_catalog;
  END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE menu_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read menu_catalog" ON menu_catalog;
DROP POLICY IF EXISTS "Allow public all menu_catalog" ON menu_catalog;

CREATE POLICY "Allow public read menu_catalog" ON menu_catalog FOR SELECT USING (true);
CREATE POLICY "Allow public all menu_catalog" ON menu_catalog FOR ALL USING (true);

-- Seed initial menu catalog data for Hotel 00000000-0000-0000-0000-000000000001
INSERT INTO menu_catalog (id, hotel_id, category, name, description, price, dietary_tags, sort_order, is_available)
VALUES
  -- Breakfast
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Breakfast', 'Classic Eggs Benedict', 'Two poached eggs on English muffins with Canadian bacon and hollandaise sauce', 22.00, '{}', 1, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Breakfast', 'Avocado Toast', 'Smashed avocado on sourdough with cherry tomatoes and feta cheese', 18.00, ARRAY['VEGETARIAN'], 2, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Breakfast', 'Açaí Bowl', 'Blended açaí with granola, fresh berries, banana and honey drizzle', 16.00, ARRAY['VEGAN', 'GLUTEN_FREE'], 3, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Breakfast', 'Brioche French Toast', 'Thick brioche slices, maple syrup, berry compote, whipped butter', 20.00, ARRAY['VEGETARIAN'], 4, true),

  -- Mains
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Mains', 'Grilled Wagyu Burger', 'A5 wagyu beef patty, truffle aioli, aged cheddar, brioche bun, hand-cut fries', 38.00, '{}', 10, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Mains', 'Pan-Seared Salmon', 'Atlantic salmon, lemon butter sauce, asparagus, roasted fingerling potatoes', 42.00, ARRAY['GLUTEN_FREE'], 11, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Mains', 'Truffle Risotto', 'Carnaroli rice, black truffle, parmesan crisp, micro herbs', 34.00, ARRAY['VEGETARIAN', 'GLUTEN_FREE'], 12, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Mains', 'Lobster Linguine', 'Boston lobster, cherry tomatoes, garlic white wine sauce, fresh herbs', 58.00, '{}', 13, true),

  -- Starters
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Starters', 'Burrata & Heirloom Tomatoes', 'Fresh burrata, heirloom tomatoes, basil oil, sea salt, sourdough crostini', 22.00, ARRAY['VEGETARIAN'], 20, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Starters', 'Shrimp Cocktail', 'Chilled jumbo shrimp, house cocktail sauce, lemon', 28.00, ARRAY['GLUTEN_FREE'], 21, true),

  -- Desserts
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Desserts', 'Tiramisu', 'Classic Italian tiramisu with espresso-soaked ladyfingers and mascarpone', 14.00, ARRAY['VEGETARIAN'], 30, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Desserts', 'Chocolate Lava Cake', 'Warm chocolate cake with molten center, served with vanilla bean ice cream', 16.00, ARRAY['VEGETARIAN'], 31, true),

  -- Beverages
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Beverages', 'Fresh Orange Juice', '100% freshly squeezed orange juice', 8.00, ARRAY['VEGAN', 'GLUTEN_FREE'], 40, true),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Beverages', 'Iced Vanilla Latte', 'Double espresso shot, oat milk, artisanal vanilla syrup', 7.00, ARRAY['VEGAN'], 41, true)
ON CONFLICT DO NOTHING;
