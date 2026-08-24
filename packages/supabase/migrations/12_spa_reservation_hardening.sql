-- ============================================================
-- Phase 2: SPA Reservation Integrity Hardening
-- Hotel QR Ordering System
-- IMPORTANT: This is a repository change intended for review before
-- applying to the live Supabase project. Do not run this migration in
-- production until the team approves the rollout.
-- ============================================================

ALTER TABLE spa_slot_locks
  ADD COLUMN IF NOT EXISTS request_id UUID NULL REFERENCES requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_spa_slot_locks_request_id
  ON spa_slot_locks(request_id);

CREATE INDEX IF NOT EXISTS idx_spa_slot_locks_hotel_therapist_status_time
  ON spa_slot_locks(hotel_id, therapist_id, status, start_time, end_time);

CREATE OR REPLACE FUNCTION create_spa_reservation(
  p_hotel_id UUID,
  p_room_id UUID,
  p_session_id UUID,
  p_therapist_id UUID,
  p_request_status TEXT,
  p_payload JSONB,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (request_id UUID, lock_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id UUID;
  v_lock_id UUID;
  v_effective_expires_at TIMESTAMPTZ;
BEGIN
  IF p_therapist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM spa_slot_locks
      WHERE hotel_id = p_hotel_id
        AND therapist_id = p_therapist_id
        AND status IN ('HELD', 'BOOKED')
        AND p_start_time < end_time
        AND p_end_time > start_time
    ) THEN
      RAISE EXCEPTION 'Spa therapist has an overlapping active reservation for the selected time window';
    END IF;
  END IF;

  v_effective_expires_at := COALESCE(p_expires_at, p_end_time + INTERVAL '10 minutes');

  INSERT INTO requests (hotel_id, room_id, request_type, status, payload)
  VALUES (p_hotel_id, p_room_id, 'SPA_BOOKING', p_request_status, p_payload)
  RETURNING id INTO v_request_id;

  INSERT INTO spa_slot_locks (
    hotel_id,
    therapist_id,
    session_id,
    start_time,
    end_time,
    status,
    expires_at,
    request_id
  )
  VALUES (
    p_hotel_id,
    p_therapist_id,
    p_session_id,
    p_start_time,
    p_end_time,
    'BOOKED',
    v_effective_expires_at,
    v_request_id
  )
  RETURNING id INTO v_lock_id;

  RETURN QUERY
  SELECT v_request_id, v_lock_id;
END;
$$;

CREATE OR REPLACE FUNCTION expire_spa_holds()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count INT := 0;
BEGIN
  WITH updated AS (
    UPDATE spa_slot_locks
    SET status = 'EXPIRED',
        expires_at = NOW()
    WHERE status = 'HELD'
      AND expires_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM updated;

  RETURN expired_count;
END;
$$;

-- Note:
-- This migration creates the stronger data model needed for Phase 2, but the
-- live Supabase project should still be reviewed and applied separately.
