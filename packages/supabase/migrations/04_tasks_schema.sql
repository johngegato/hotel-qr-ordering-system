-- ============================================================
-- Phase 4: Room Requests & Task Routing Schema
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Extend catalog_items with task-specific fields (idempotent)
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS priority           TEXT DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  ADD COLUMN IF NOT EXISTS target_sla_mins   INT  DEFAULT 30,
  ADD COLUMN IF NOT EXISTS target_department TEXT
    CHECK (target_department IN ('HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK'));

-- 2. SLA Escalations table
CREATE TABLE IF NOT EXISTS sla_escalations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  escalation_level INT  NOT NULL DEFAULT 1,
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_escalations_request ON sla_escalations(request_id);
CREATE INDEX IF NOT EXISTS idx_sla_escalations_triggered ON sla_escalations(triggered_at DESC);

-- 3. Realtime for sla_escalations — idempotent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sla_escalations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sla_escalations;
  END IF;
END $$;

-- 4. RLS for sla_escalations — idempotent
ALTER TABLE sla_escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read sla_escalations"   ON sla_escalations;
DROP POLICY IF EXISTS "Allow public insert sla_escalations" ON sla_escalations;
CREATE POLICY "Allow public read sla_escalations"   ON sla_escalations FOR SELECT USING (true);
CREATE POLICY "Allow public insert sla_escalations" ON sla_escalations FOR INSERT WITH CHECK (true);

-- ============================================================
-- SEED DATA: Room Request Catalog Items
-- ============================================================

INSERT INTO catalog_items (
  id, hotel_id, department, name, description,
  price, is_available, requires_on_call,
  priority, target_sla_mins, target_department,
  sort_order, category
) VALUES

-- HOUSEKEEPING (SLA 15 mins)
(
  'A0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Extra Towels', 'Request additional bath or hand towels.',
  0, TRUE, FALSE, 'MEDIUM', 15, 'HOUSEKEEPING', 1, 'Housekeeping'
),
(
  'A0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Pillow Top-Up', 'Request extra pillows for the bed.',
  0, TRUE, FALSE, 'LOW', 20, 'HOUSEKEEPING', 2, 'Housekeeping'
),
(
  'A0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Toiletry Refill', 'Request shampoo, conditioner, soap, or other toiletries.',
  0, TRUE, FALSE, 'LOW', 20, 'HOUSEKEEPING', 3, 'Housekeeping'
),
(
  'A0000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Room Cleaning', 'Request a full room cleaning and bed turndown.',
  0, TRUE, FALSE, 'MEDIUM', 30, 'HOUSEKEEPING', 4, 'Housekeeping'
),
(
  'A0000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Laundry Pickup', 'Schedule laundry pickup from your room.',
  0, TRUE, FALSE, 'LOW', 30, 'HOUSEKEEPING', 5, 'Housekeeping'
),

-- MAINTENANCE (SLA 30 mins)
(
  'A0000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'AC Not Working', 'Air conditioning unit has an issue.',
  0, TRUE, FALSE, 'URGENT', 20, 'MAINTENANCE', 1, 'Maintenance'
),
(
  'A0000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'TV / Remote Issue', 'TV or remote control not functioning.',
  0, TRUE, FALSE, 'MEDIUM', 30, 'MAINTENANCE', 2, 'Maintenance'
),
(
  'A0000000-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Plumbing Issue', 'Report a leak, clog, or water pressure issue.',
  0, TRUE, FALSE, 'HIGH', 20, 'MAINTENANCE', 3, 'Maintenance'
),
(
  'A0000000-0000-0000-0000-000000000009',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Light Bulb Out', 'A light in the room needs replacing.',
  0, TRUE, FALSE, 'LOW', 45, 'MAINTENANCE', 4, 'Maintenance'
),

-- FRONT DESK (SLA 10 mins)
(
  'A0000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Extra Key Card', 'Request an additional or replacement key card.',
  0, TRUE, FALSE, 'HIGH', 10, 'FRONT_DESK', 1, 'Front Desk'
),
(
  'A0000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Late Checkout Request', 'Request an extension to your checkout time.',
  0, TRUE, FALSE, 'MEDIUM', 15, 'FRONT_DESK', 2, 'Front Desk'
),
(
  'A0000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'ROOM_REQUEST', 'Luggage Assistance', 'Request bellhop help with your luggage.',
  0, TRUE, FALSE, 'MEDIUM', 10, 'FRONT_DESK', 3, 'Front Desk'
)

ON CONFLICT (id) DO NOTHING;
