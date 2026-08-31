-- Migration 21: Add agora_channel to requests for live voice calls
-- Stores the Agora RTC channel name for LIVE_CALL request types
-- so both guest and staff can join the same Agora channel.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS agora_channel TEXT;

COMMENT ON COLUMN public.requests.agora_channel IS
  'Agora RTC channel name for LIVE_CALL requests. NULL for all other request types.';
