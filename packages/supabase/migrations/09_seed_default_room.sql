-- Ensure DEFAULT_ROOM_ID exists in rooms (safe seed)

INSERT INTO rooms (id, hotel_id, room_number, floor, room_type, qr_auth_hash, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '302',
  '3',
  'DELUXE',
  'seed-default-302',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Optional: record audit log (if audit_logs table exists)
INSERT INTO audit_logs (hotel_id, action, details)
SELECT '00000000-0000-0000-0000-000000000001', 'SEED_ROOM_APPLIED', json_build_object('room_id', '00000000-0000-0000-0000-000000000101')
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id = '00000000-0000-0000-0000-000000000101');
