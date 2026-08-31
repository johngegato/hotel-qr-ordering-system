# Implementation Plan: F&B Access Control, Universal Guest Quick Dialing, Manual Food Orders, and F&B Direct Call FAB

This implementation plan delivers full-stack enhancements across the hotel ordering system:
1. **Database & Schema**: `fnb_phone_number` column on `hotels` table, phone propagation across guest & staff requests, and migration files.
2. **Admin Settings**: View and update the F&B / Dining Direct Phone Number on `/admin/settings`.
3. **Guest Web Dining**: Persistent floating action button (FAB) for direct calling F&B on `/app/stay/dining` with dynamically loaded `fnb_phone_number`.
4. **Staff App Role-Based Access Control (RBAC)**: Dedicated streamlined view for `KITCHEN` (F&B) accounts (showing only Food Orders and F&B metrics, suppressing front desk / spa / task queues and filtering alert popups). Full access retained for `ADMIN`, `FRONT_DESK`, and other staff roles.
5. **Staff App Universal Guest Quick Call**: A unified, one-tap `📞 Call Guest` button across **all** cards and modals (`CallQueue`, `TaskQueue`, `SpaQueue`, `FoodQueue`, `RequestHistory`, `DedicatedCallModule`, `EditSpaBookingModal`) with graceful `No Phone Provided` disabled state.
6. **Staff App Manual Order Entry**: In `FoodQueue`, a rich "+ Create Manual Order" / "Phone Order" modal with active room selection, guest name & phone, active catalog items with quantity increments, custom cooking instructions, and dynamic hotel service charge calculation.

*(Note: In accordance with your request, the AI chatbot widget will be added in a future phase and is omitted here to focus on these core operational features.)*

---

## User Review Required

> [!IMPORTANT]
> - Database migration `19_fnb_phone_number.sql` adds `fnb_phone_number TEXT` to the `hotels` table. When deployed, this SQL should be executed in the Supabase SQL editor.
> - The F&B role (`KITCHEN`) will see a dedicated kitchen view in the staff app, hiding non-dining modules while ensuring full operational efficiency for dining orders and phone order entry.

---

## Proposed Changes

### 1. Database & Supabase Types

#### [NEW] [19_fnb_phone_number.sql](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/web/supabase/migrations/19_fnb_phone_number.sql) and [19_fnb_phone_number.sql](file:///c:/AMD/qr/hotel-qr-ordering-system/packages/supabase/migrations/19_fnb_phone_number.sql)
- Add `fnb_phone_number TEXT DEFAULT '+1-800-555-0199'` column to `hotels` table.

#### [MODIFY] [packages/supabase/types/index.ts](file:///c:/AMD/qr/hotel-qr-ordering-system/packages/supabase/types/index.ts)
- Update `Hotel` interface to include `fnb_phone_number?: string | null`.
- Update `FoodOrderPayload` and `RequestItem` payload documentation to guarantee `guest_phone?: string` typing.

---

### 2. Admin Page (`apps/web`)

#### [MODIFY] [apps/web/app/admin/settings/page.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/web/app/admin/settings/page.tsx)
- Add state for `fnbPhoneNumber`.
- Fetch `fnb_phone_number` on mount and populate input field in the Property / Direct Contact section.
- Save `fnb_phone_number` to `hotels` table on save and include in `audit_logs`.

---

### 3. Guest Web (`apps/web`)

#### [NEW] [apps/web/app/app/stay/components/FnBDiningFAB.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/web/app/app/stay/components/FnBDiningFAB.tsx)
- Create a dedicated Floating Action Button for dining that queries `fnb_phone_number` (with fallback to hotel general phone).
- Features touch-optimized pill with call icon (`📞`), pulsing ring, and `href="tel:<phone>"`.

#### [MODIFY] [apps/web/app/app/stay/dining/page.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/web/app/app/stay/dining/page.tsx)
- Embed `FnBDiningFAB` at the bottom of the dining menu screen alongside cart controls.

---

### 4. Staff App (`apps/staff-app`)

#### [MODIFY] [apps/staff-app/App.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/App.tsx)
- **RBAC for `KITCHEN` role**:
  - If `activeStaffUser?.role === 'KITCHEN'`:
    - Show `Kitchen / F&B Portal` in header.
    - Hide `DedicatedCallModule`, `CallQueue`, `SpaTimetable`, `SpaQueue`, `TaskQueue`.
    - In stats grid, emphasize F&B / Food metrics.
    - In `IncomingRequestAlert` and `PendingRequestsReminderModal`, filter unhandled alerts strictly to `request_type === 'FOOD_ORDER'`.
  - Other roles (`FRONT_DESK`, `ADMIN`, `MANAGER`): retain complete view and all queues.

#### [MODIFY] [apps/staff-app/components/FoodQueue.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/FoodQueue.tsx)
- **Universal Quick Call**: Ensure all food cards render `📞 Call Guest (${guestPhone})` or disabled `📞 No Phone Provided`.
- **Manual Order Creation Modal**:
  - Add **"+ Create Manual Order"** / **"Phone Order"** button in header.
  - Modal with:
    - Room selection dropdown / input (fetching active rooms from `rooms` table).
    - Guest name and phone input (`guest_phone`).
    - Menu item picker with category filtering, search, and +/- quantity selector from `catalog_items` / `menu_items`.
    - Special cooking instructions / preparation notes.
    - Status selection (`PREPARING` vs `PENDING`).
    - Dynamic Service Charge calculation (`service_charge_enabled` and `service_charge_pct` fetched from hotel).
    - Submits direct insert to `requests` table with `request_type = 'FOOD_ORDER'`, optimistic state update, and audit log entry.

#### [MODIFY] [apps/staff-app/components/TaskQueue.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/TaskQueue.tsx)
- Add universal `📞 Call Guest` button to every task card (extracting `payload.guest_phone` / `payload.phone`).
- If no phone exists, render disabled button with `📞 No Phone Provided`.

#### [MODIFY] [apps/staff-app/components/SpaQueue.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/SpaQueue.tsx)
- Standardize the `📞 Call Guest` button to render consistently on every card with disabled `No Phone Provided` fallback.

#### [MODIFY] [apps/staff-app/components/EditSpaBookingModal.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/EditSpaBookingModal.tsx)
- Add quick-call button directly in the modal header/guest banner next to the room number and phone number.

#### [MODIFY] [apps/staff-app/components/DedicatedCallModule.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/DedicatedCallModule.tsx)
- Enhance quick call button styling and disabled state consistency.

#### [MODIFY] [apps/staff-app/components/RequestHistory.tsx](file:///c:/AMD/qr/hotel-qr-ordering-system/apps/staff-app/components/RequestHistory.tsx)
- Add universal `📞 Call Guest` button across all request types in history list cards (Food, Spa, Task, Call).
- In detail modal bottom sheet, render direct dial button for any request with a valid `guest_phone`.

---

## Verification Plan

### Automated Type & Build Checks
```bash
# 1. Staff App TypeScript verification
npx -p typescript tsc --noEmit -p apps/staff-app/tsconfig.json

# 2. Web App TypeScript verification
npx -p typescript tsc --noEmit -p apps/web/tsconfig.json

# 3. Next.js Web App Production Build
npm --prefix apps/web run build
```

### Manual Verification
1. **Admin Settings**: Open `/admin/settings`, modify `F&B Direct Phone Number`, save, verify persisted in Supabase and audit logs.
2. **Guest Dining FAB**: Open `/app/stay/dining`, verify the F&B call button displays the dynamic F&B phone number and triggers `tel:` link.
3. **Staff App RBAC**: Log in with a `KITCHEN` user; verify only Food Orders module is displayed. Log in with `FRONT_DESK` or `ADMIN`; verify all modules are available.
4. **Manual Food Order**: In `FoodQueue`, click "+ Create Manual Order", select room, add items, set notes, verify live service charge calculation, submit, and confirm it appears in the queue with correct price breakdown and audit trail.
5. **Universal Quick Dialing**: Check cards in `CallQueue`, `TaskQueue`, `SpaQueue`, `FoodQueue`, `RequestHistory`, and `EditSpaBookingModal`. Verify active phone numbers trigger dialer and missing numbers display disabled state cleanly.
6. **Git Commit & Push**: Commit all changes and push to branch `backup-8-31-26-4pm`.
