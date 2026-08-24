-- Use the scheduled appointment window when evaluating pending bookings.
-- This migration is additive and preserves created_at behavior for legacy rows.

CREATE OR REPLACE FUNCTION check_sla_breaches(hotel_id_param UUID)
RETURNS INT AS $$
DECLARE
  breached_count INT := 0;
  req RECORD;
  scheduled_end TIMESTAMPTZ;
BEGIN
  FOR req IN
    SELECT id, hotel_id, request_type, status, created_at, payload
    FROM requests
    WHERE hotel_id = hotel_id_param
      AND status IN ('PENDING', 'PENDING_ON_CALL')
  LOOP
    scheduled_end := CASE
      WHEN req.payload->>'scheduled_at' IS NOT NULL
        AND req.payload->>'scheduled_at' <> ''
      THEN (req.payload->>'scheduled_at')::timestamptz
        + (CASE
            WHEN req.payload->>'duration_mins' ~ '^[0-9]+$'
            THEN (req.payload->>'duration_mins')::int
            ELSE 60
          END * INTERVAL '1 minute')
      ELSE req.created_at + INTERVAL '20 minutes'
    END;

    IF scheduled_end >= NOW() THEN
      CONTINUE;
    END IF;

    UPDATE requests
    SET status = 'ESCALATED_L1'
    WHERE id = req.id;

    INSERT INTO audit_logs (hotel_id, request_id, action, details)
    VALUES (
      req.hotel_id,
      req.id,
      'SLA_BREACHED',
      jsonb_build_object(
        'request_type', req.request_type,
        'scheduled_end', scheduled_end,
        'overdue_mins', EXTRACT(EPOCH FROM (NOW() - scheduled_end))/60
      )
    );

    breached_count := breached_count + 1;
  END LOOP;

  RETURN breached_count;
END;
$$ LANGUAGE plpgsql;
