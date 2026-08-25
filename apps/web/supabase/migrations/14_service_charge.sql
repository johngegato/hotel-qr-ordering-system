-- Migration: 14_service_charge.sql
-- Adds service charge configuration columns to the hotels table.
-- service_charge_enabled: toggles whether the charge is applied (default ON)
-- service_charge_pct:     the percentage to apply (default 10%)
--
-- These settings are managed from /admin/settings and consumed by:
--   - apps/web/app/app/stay/dining/page.tsx       (notice banner)
--   - apps/web/app/app/stay/dining/checkout/page.tsx (price breakdown & payload)

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS service_charge_enabled boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS service_charge_pct     numeric(5,2) NOT NULL DEFAULT 10.00;

-- Back-fill existing hotel rows with default values (already covered by DEFAULT, but explicit for clarity)
UPDATE hotels
  SET service_charge_enabled = true,
      service_charge_pct     = 10.00
WHERE service_charge_enabled IS NULL
   OR service_charge_pct IS NULL;
