-- ============================================================
-- Function Room Booking & Equipment Management Schema
-- Hotel QR Ordering System
-- ============================================================

-- 1. Function rooms table
CREATE TABLE IF NOT EXISTS function_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_function_rooms_hotel_id ON function_rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_function_rooms_active ON function_rooms(is_active);

-- 2. Rental equipment catalog
CREATE TABLE IF NOT EXISTS function_room_equipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rental_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_function_room_equipments_hotel_id ON function_room_equipments(hotel_id);
CREATE INDEX IF NOT EXISTS idx_function_room_equipments_active ON function_room_equipments(is_active);

-- 3. Booking table
CREATE TABLE IF NOT EXISTS function_room_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  function_room_id UUID NOT NULL REFERENCES function_rooms(id) ON DELETE CASCADE,
  booker_name TEXT NOT NULL,
  phone_number TEXT,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  food_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  banquet_food_notes TEXT,
  rented_equipments JSONB NOT NULL DEFAULT '[]'::jsonb,
  downpayment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('CONFIRMED', 'PENDING', 'CANCELLED', 'COMPLETED')),
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_function_room_bookings_hotel_id ON function_room_bookings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_function_room_bookings_room_id ON function_room_bookings(function_room_id);
CREATE INDEX IF NOT EXISTS idx_function_room_bookings_date ON function_room_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_function_room_bookings_status ON function_room_bookings(status);

-- 4. Add reminder settings to existing notification settings table
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS notify_same_day BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_days_before INTEGER NOT NULL DEFAULT 1;

UPDATE notification_settings
SET notify_same_day = COALESCE(notify_same_day, true),
    notify_days_before = COALESCE(notify_days_before, 1)
WHERE notify_same_day IS NULL OR notify_days_before IS NULL;

-- 5. Seed default function room data for Grand Hotel
INSERT INTO function_rooms (id, hotel_id, name, capacity, is_active)
VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000001', 'Grand Ballroom', 220, true),
  ('11111111-1111-4111-8111-111111111112', '00000000-0000-0000-0000-000000000001', 'Executive Hall', 120, true),
  ('11111111-1111-4111-8111-111111111113', '00000000-0000-0000-0000-000000000001', 'Garden Terrace', 80, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO function_room_equipments (id, hotel_id, name, rental_price, is_active)
VALUES
  ('22222222-2222-4222-8222-222222222221', '00000000-0000-0000-0000-000000000001', 'Projector & Screen', 1800.00, true),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000001', 'Wireless Mic', 650.00, true),
  ('22222222-2222-4222-8222-222222222223', '00000000-0000-0000-0000-000000000001', 'PA System', 900.00, true),
  ('22222222-2222-4222-8222-222222222224', '00000000-0000-0000-0000-000000000001', 'Stage Lighting Package', 1200.00, true)
ON CONFLICT (id) DO NOTHING;

-- 6. Prevent double-booking same room at overlapping times
CREATE OR REPLACE FUNCTION prevent_function_room_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM function_room_bookings b
    WHERE b.function_room_id = NEW.function_room_id
      AND b.booking_date = NEW.booking_date
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('CONFIRMED', 'PENDING')
      AND NEW.status IN ('CONFIRMED', 'PENDING')
      AND NEW.start_time < b.end_time
      AND NEW.end_time > b.start_time
  ) THEN
    RAISE EXCEPTION 'This function room already has a booking scheduled during the selected time slot.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_function_room_booking_overlap ON function_room_bookings;
CREATE TRIGGER trg_prevent_function_room_booking_overlap
BEFORE INSERT OR UPDATE OF function_room_id, booking_date, start_time, end_time, status
ON function_room_bookings
FOR EACH ROW
EXECUTE FUNCTION prevent_function_room_booking_overlap();

-- 7. RLS
ALTER TABLE function_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE function_room_equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE function_room_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow read function_rooms"
ON function_rooms
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Allow write function_rooms"
ON function_rooms
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow read function_room_equipments"
ON function_room_equipments
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Allow write function_room_equipments"
ON function_room_equipments
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow read function_room_bookings"
ON function_room_bookings
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Allow write function_room_bookings"
ON function_room_bookings
FOR ALL
USING (true)
WITH CHECK (true);
