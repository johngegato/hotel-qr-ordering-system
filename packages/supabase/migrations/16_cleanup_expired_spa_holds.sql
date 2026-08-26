-- ============================================================
-- Migration 16: Automatic Cleanup Cron for Expired HELD Spa Locks
-- Hotel QR Ordering System
--
-- This migration adds:
-- 1. `cleanup_expired_spa_holds()` function:
--    - Marks unconfirmed 'HELD' locks as 'EXPIRED' once expires_at passes
--    - Purges abandoned 'HELD' / 'EXPIRED' lock records older than 1 hour
-- 2. Lazy cleanup trigger on `spa_slot_locks` table on new inserts
-- 3. Optional `pg_cron` recurring schedule (every 10 minutes) if pg_cron is enabled
-- ============================================================

-- 1. Create or Replace the Comprehensive Cleanup Function
CREATE OR REPLACE FUNCTION cleanup_expired_spa_holds()
RETURNS TABLE (
  expired_count INT,
  purged_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired INT := 0;
  v_purged INT := 0;
BEGIN
  -- A. Mark any active HELD locks as EXPIRED if expires_at has passed
  WITH updated AS (
    UPDATE spa_slot_locks
    SET status = 'EXPIRED',
        expires_at = NOW()
    WHERE status = 'HELD'
      AND expires_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired FROM updated;

  -- B. Purge abandoned temporary HELD / EXPIRED locks older than 1 hour
  WITH deleted AS (
    DELETE FROM spa_slot_locks
    WHERE status IN ('HELD', 'EXPIRED')
      AND expires_at < (NOW() - INTERVAL '1 hour')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_purged FROM deleted;

  RETURN QUERY SELECT v_expired, v_purged;
END;
$$;

-- Grant execution to authenticated & service roles
GRANT EXECUTE ON FUNCTION cleanup_expired_spa_holds() TO postgres, authenticated, service_role, anon;

-- 2. Trigger: Automatically sweep expired holds on every new lock attempt (Lazy Self-Cleaning)
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_holds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Perform quick non-blocking sweep of expired holds
  PERFORM cleanup_expired_spa_holds();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_expired_spa_holds ON spa_slot_locks;

CREATE TRIGGER trg_cleanup_expired_spa_holds
  BEFORE INSERT ON spa_slot_locks
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_cleanup_expired_holds();

-- 3. Optional pg_cron recurring job (runs every 10 minutes if pg_cron is available)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule existing job if already present to prevent duplicate registrations
    BEGIN
      PERFORM cron.unschedule('cleanup-expired-spa-holds');
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if not yet scheduled
    END;

    -- Schedule to run every 10 minutes
    PERFORM cron.schedule(
      'cleanup-expired-spa-holds',
      '*/10 * * * *',
      'SELECT cleanup_expired_spa_holds();'
    );
    RAISE NOTICE 'pg_cron job cleanup-expired-spa-holds registered successfully.';
  ELSE
    RAISE NOTICE 'pg_cron extension not active. Automated trigger on insert will handle cleanup.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping pg_cron setup (pg_cron may not be enabled). Insert trigger remains active.';
END $$;
