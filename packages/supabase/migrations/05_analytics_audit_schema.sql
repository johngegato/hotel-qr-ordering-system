-- ============================================================
-- Phase 5: Analytics, SLA Escalations & Audit Logs Schema
-- Hotel QR Ordering System
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  request_id  UUID REFERENCES requests(id) ON DELETE CASCADE,
  action      TEXT NOT NULL, -- e.g. 'REQUEST_CREATED', 'STATUS_CHANGED', 'SLA_BREACHED', 'ESCALATED_L1'
  actor_id    UUID,
  details     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_hotel ON audit_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 2. REALTIME & RLS FOR AUDIT LOGS — idempotent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
  END IF;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read audit_logs"   ON audit_logs;
DROP POLICY IF EXISTS "Allow public insert audit_logs" ON audit_logs;
CREATE POLICY "Allow public read audit_logs"   ON audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert audit_logs" ON audit_logs FOR INSERT WITH CHECK (true);

-- 3. POSTGRES TRIGGER: Automatic Audit Logging for Requests
CREATE OR REPLACE FUNCTION trg_requests_audit_logger()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (hotel_id, request_id, action, details)
    VALUES (
      NEW.hotel_id,
      NEW.id,
      'REQUEST_CREATED',
      jsonb_build_object(
        'request_type', NEW.request_type,
        'initial_status', NEW.status,
        'room_id', NEW.room_id,
        'payload', NEW.payload
      )
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO audit_logs (hotel_id, request_id, action, details)
      VALUES (
        NEW.hotel_id,
        NEW.id,
        CASE
          WHEN NEW.status = 'ESCALATED_L1' THEN 'ESCALATED_L1'
          ELSE 'STATUS_CHANGED'
        END,
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'request_type', NEW.request_type,
          'claimed_at', NEW.claimed_at,
          'claimed_by', NEW.claimed_by
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS requests_audit_trigger ON requests;
CREATE TRIGGER requests_audit_trigger
  AFTER INSERT OR UPDATE ON requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_requests_audit_logger();

-- 4. FUNCTION: Check SLA Breaches & Escalate
CREATE OR REPLACE FUNCTION check_sla_breaches(hotel_id_param UUID)
RETURNS INT AS $$
DECLARE
  breached_count INT := 0;
  req RECORD;
BEGIN
  FOR req IN
    SELECT id, hotel_id, request_type, status, created_at
    FROM requests
    WHERE hotel_id = hotel_id_param
      AND status IN ('PENDING', 'PENDING_ON_CALL')
      AND created_at < (NOW() - INTERVAL '20 minutes')
  LOOP
    -- Update status to ESCALATED_L1 (trigger handles audit log entry)
    UPDATE requests
    SET status = 'ESCALATED_L1'
    WHERE id = req.id;

    -- Add explicit SLA breach log entry
    INSERT INTO audit_logs (hotel_id, request_id, action, details)
    VALUES (
      req.hotel_id,
      req.id,
      'SLA_BREACHED',
      jsonb_build_object(
        'request_type', req.request_type,
        'overdue_mins', EXTRACT(EPOCH FROM (NOW() - req.created_at))/60
      )
    );

    breached_count := breached_count + 1;
  END LOOP;

  RETURN breached_count;
END;
$$ LANGUAGE plpgsql;

-- 5. SEED DATA: Sample Audit Logs for ROI Dashboard & Audit Timeline
INSERT INTO audit_logs (hotel_id, request_id, action, details, created_at)
VALUES
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'REQUEST_CREATED',
  '{"request_type": "FOOD_ORDER", "initial_status": "PENDING", "room_number": "302", "item": "Wagyu Beef Burger"}'::jsonb,
  NOW() - INTERVAL '2 hours'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'STATUS_CHANGED',
  '{"old_status": "PENDING", "new_status": "PREPARING", "request_type": "FOOD_ORDER"}'::jsonb,
  NOW() - INTERVAL '1 hour 50 mins'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'STATUS_CHANGED',
  '{"old_status": "PREPARING", "new_status": "RESOLVED", "request_type": "FOOD_ORDER"}'::jsonb,
  NOW() - INTERVAL '1 hour 30 mins'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'REQUEST_CREATED',
  '{"request_type": "SPA_BOOKING", "initial_status": "PENDING", "room_number": "302", "service": "Deep Tissue Massage"}'::jsonb,
  NOW() - INTERVAL '4 hours'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'STATUS_CHANGED',
  '{"old_status": "PENDING", "new_status": "CONFIRMED", "request_type": "SPA_BOOKING"}'::jsonb,
  NOW() - INTERVAL '3 hours 55 mins'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'SLA_BREACHED',
  '{"request_type": "TASK", "target_department": "MAINTENANCE", "overdue_mins": 25}'::jsonb,
  NOW() - INTERVAL '5 hours'
),
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'ESCALATED_L1',
  '{"request_type": "TASK", "old_status": "PENDING", "new_status": "ESCALATED_L1", "reason": "SLA timeout exceeded"}'::jsonb,
  NOW() - INTERVAL '5 hours'
);
