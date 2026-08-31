# Chat History: F&B Access Control, Universal Guest Quick Dialing, Manual Orders & Bug Fixes

**Date**: August 31, 2026  
**Session Focus**: Full-stack F&B Role-Based Access Control, Universal Guest Dialing, Manual/Phone Food Order Creation, TaskQueue Resolution Fix, and RequestHistory Enhancements  
**Branch**: `backup-8-31-26-4pm` -> `main`

---

## 1. Objectives & Overview

1. **F&B Access Control & RBAC**: Provide a dedicated streamlined view for `KITCHEN` staff accounts in the staff app (showing only Food Orders and F&B metrics, hiding non-dining modules, and filtering alert popups).
2. **Universal Guest Quick Call**: Add one-tap `📞 Call Guest` buttons across all queues and modals (`FoodQueue`, `TaskQueue`, `SpaQueue`, `DedicatedCallModule`, `EditSpaBookingModal`, `RequestHistory`) with a clean disabled fallback when no phone number is provided.
3. **Manual Food Order Entry**: Enable staff to create food orders directly in `FoodQueue` via a modal with active room selection, guest name/phone, catalog item picker, custom notes, and live service charge calculation.
4. **F&B Direct Dialing FAB**: Persistent floating action button on `/app/stay/dining` with dynamically loaded `fnb_phone_number` from the hotel record.
5. **Bug Fixes**:
   - `TaskQueue` handleResolve PGRST204 crash (caused by nonexistent `updated_at` column).
   - `RequestHistory` and `TaskQueue` guest phone number extraction for tasks.

---

## 2. Key Changes Made

### A. Database & Schema
- `packages/supabase/migrations/19_fnb_phone_number.sql` & `apps/web/supabase/migrations/19_fnb_phone_number.sql`:
  - Added `fnb_phone_number TEXT DEFAULT '+1-800-555-0199'` column to `hotels` table.
- `packages/supabase/types/index.ts`:
  - Added `fnb_phone_number?: string | null` to `Hotel` interface.
  - Ensured `guest_phone?: string` typing across request payloads.

### B. Admin Page (`apps/web`)
- `apps/web/app/admin/settings/page.tsx`:
  - Added F&B Direct Phone Number input in Property Settings.
  - Saves to `hotels.fnb_phone_number` and creates audit trail log.

### C. Guest Web (`apps/web`)
- `apps/web/app/app/stay/components/FnBDiningFAB.tsx` [NEW]:
  - Floating pill button for 1-tap F&B direct calling on `/app/stay/dining`.
- `apps/web/app/app/stay/requests/page.tsx`:
  - Explicitly wrote `guest_phone: phone` into the `TaskPayload` object.

### D. Staff App (`apps/staff-app`)
- `App.tsx`:
  - RBAC for `KITCHEN` role: dedicated kitchen portal, hides non-dining queues, filters reminder alerts.
- `FoodQueue.tsx`:
  - "+ Phone / Manual Order" creation modal with room picker, item quantities, cooking notes, service charge calculation, and audit trail.
  - Universal `📞 Call Guest` button on all cards.
- `TaskQueue.tsx`:
  - Universal `📞 Call Guest` button on task cards.
  - Fixed `handleResolve` by removing `updated_at` from Supabase update payload.
  - Added regex phone number extraction from `custom_notes`.
- `SpaQueue.tsx` & `EditSpaBookingModal.tsx`:
  - Standardized `📞 Call Guest` buttons and modal header dial action.
- `RequestHistory.tsx`:
  - Universal quick-call row on all card types (TASK, FOOD, SPA, CALL).
  - Multi-tier phone resolution (`guest_phone`, `phone_number`, `phone`, `custom_notes` regex, `special_instructions` regex).
  - Expanded Task Request details and `📞 Dial Now` action in detail modal.

---

## 3. Verification & Readiness

- `apps/staff-app`: `tsc --noEmit` passes with 0 errors.
- `apps/web`: `tsc --noEmit` passes with 0 errors.
- `apps/staff-app` configuration verified for Expo / EAS builds (`google-services.json` present, permissions configured, `eas.json` internal/APK profiles ready).
