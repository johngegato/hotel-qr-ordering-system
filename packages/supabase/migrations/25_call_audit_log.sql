-- Migration 25: Call audit logs for live voice calls

CREATE TABLE IF NOT EXISTS call_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES requests(id),
  hotel_id UUID NOT NULL,
  guest_uid INTEGER NOT NULL DEFAULT 1,
  staff_uid INTEGER NOT NULL DEFAULT 2,
  agora_channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  end_reason TEXT,
  quality_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_audit_hotel_time ON call_audit_logs(hotel_id, started_at DESC);
