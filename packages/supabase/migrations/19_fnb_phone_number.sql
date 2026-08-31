-- Migration 19: Add F&B Direct Phone Number to hotels table
-- Supports dynamic dial configuration for F&B staff and guest dining FAB

ALTER TABLE hotels
ADD COLUMN IF NOT EXISTS fnb_phone_number TEXT DEFAULT '+1-800-555-0199';

COMMENT ON COLUMN hotels.fnb_phone_number IS 'Direct phone number for F&B / Room Service dining department';
