Here is your complete, consolidated Master AI Prompting Roadmap from Phase 0 through
Phase 5.
Save this document or place it alongside your context.md file in your project root. When you
begin developing each feature in your AI IDE (Cursor, Windsurf, Copilot, etc.), copy and paste
the prompts sequentially for that specific slice.
🚀 Master AI Prompting Roadmap
📂 Prerequisites: Project File context.md
Create context.md in your project root before executing any prompts:
# Master Project Context: Hospitality SaaS Platform
## Architecture & Tech Stack
- Monorepo structure:
1. `apps/web`: Next.js (React, App Router, Tailwind CSS, TypeScript)
for Guest Web App & Admin Dashboard.
2. `apps/staff-app`: React Native (Expo, TypeScript) for Front Desk
/ Staff Android Tablet App.
3. `packages/supabase`: Shared DB types & migration scripts.
- Backend: Supabase (PostgreSQL, Auth, Realtime WebSockets, Storage).
## Core Principles
- Methodology: Vertical Slice / Feature-Driven Development.
- Multi-Tenancy: All data isolation keyed by `hotel_id` or `room_id`.
- Guest Access: Ephemeral session auth via QR URL parameters
(`room_id` + `qr_auth_hash`).
- TypeScript: Strictly typed interfaces across all apps.
🧱 Phase 0: The Core Skeleton (Foundation)
Prompt 0.1 — Monorepo & App Initialization
"Refer to context.md. Generate the terminal commands and folder structure to set up a
monorepo containing two apps: apps/web (Next.js with App Router, TypeScript, Tailwind CSS)
and apps/staff-app (Expo React Native with TypeScript). Install @supabase/supabase-js in both
applications."
Prompt 0.2 — Supabase Base Multi-Tenant Schema
"Write PostgreSQL scripts for Supabase to set up Phase 0 multi-tenancy:
1. hotels table (id UUID PRIMARY KEY, name TEXT, created_at TIMESTAMPTZ).
2. rooms table (id UUID PRIMARY KEY, hotel_id FK to hotels, room_number TEXT,
qr_auth_hash TEXT UNIQUE).
3. guest_sessions table (id UUID PRIMARY KEY, room_id FK to rooms, phone_number

TEXT nullable, status TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ).
4. Seed Data: One hotel ('Grand Hotel') and one room ('Room 302' with hash
'secret-hash-302'). Output raw SQL with basic indexes."
Prompt 0.3 — Guest QR URL Verification Route (Next.js)
"In apps/web, create the route /app/stay/page.tsx. This page should parse URL search
parameters room and hash. Query the Supabase rooms table to verify qr_auth_hash. If valid,
display a simple card: 'Welcome to Room [room_number]! Session Active.' Handle loading and
invalid hash states."
Prompt 0.4 — Staff Tablet Verification Component (Expo)
"In apps/staff-app/App.tsx, write a simple React Native component that connects to Supabase
and queries the hotels count. Display a screen showing 'Front Desk Tablet Interface' with a
green indicator: 'Connected to Supabase' when verified."
📞 Phase 1: The "Call Front Desk" Vertical Slice
Prompt 1.1 — Requests Table Schema
"Write PostgreSQL SQL to create a requests table in Supabase:
● id: UUID Primary Key (gen_random_uuid())
● hotel_id: UUID FK to hotels
● room_id: UUID FK to rooms
● request_type: TEXT ('CALL_REQUEST')
● status: TEXT ('PENDING', 'CLAIMED', 'RESOLVED')
● payload: JSONB default {}
● created_at: TIMESTAMPTZ default NOW()
● claimed_at: TIMESTAMPTZ nullable
● claimed_by: UUID nullable Output raw SQL with indexes on hotel_id and status."
Prompt 1.2 — Guest Dual-Action Call Modal (Next.js)
"In apps/web, create a React component CallFrontDeskModal.tsx. Offer two options:
1. 'Call Now' Button: HTML link using href="tel:+1234567890" (pass phone number via
prop).
2. 'Request a Call' Button: Inserts a row into Supabase requests table with request_type:
'CALL_REQUEST' and status: 'PENDING'. Disable the button upon request, start a
3-minute local countdown timer, and show text: 'Notifying Front Desk...'."
Prompt 1.3 — Staff Real-Time Ticket Queue (Expo)
"In apps/staff-app, create a component CallQueue.tsx. Use Supabase Realtime WebSockets to
subscribe to INSERT and UPDATE events on the requests table where request_type =
'CALL_REQUEST' and status = 'PENDING'. Render cards showing: Room Number in large text,
Elapsed time counter, and a 'Claim Request' button that updates status = 'CLAIMED' and

claimed_at = NOW()."
Prompt 1.4 — Real-Time Loop Closure (Guest Side)
"In apps/web, update CallFrontDeskModal.tsx to subscribe via Supabase Realtime WebSockets
to the active request ID. When status changes from 'PENDING' to 'CLAIMED', update the UI in
real time to show a green success state: 'Staff member is calling your room now'."
💆 Phase 2: The Spa Booking Vertical Slice
Prompt 2.1 — Spa & Slot Locks Schema
"Write PostgreSQL scripts for Supabase to support Spa bookings:
1. therapists table (id UUID, hotel_id FK, full_name TEXT, is_on_call BOOLEAN default
FALSE, is_active BOOLEAN default TRUE).
2. spa_slot_locks table (id UUID, hotel_id FK, therapist_id FK nullable, start_time
TIMESTAMPTZ, end_time TIMESTAMPTZ, session_id FK to guest_sessions, status
TEXT ['HELD', 'BOOKED'], expires_at TIMESTAMPTZ).
3. catalog_items table: Support department = 'SPA', duration_mins INT, price NUMERIC,
requires_on_call BOOLEAN default FALSE. Output raw SQL with RLS policies allowing
guests to insert temporary locks."
Prompt 2.2 — Admin Spa & Therapist Management (Next.js)
"In apps/web under /app/admin/spa:
1. Create a CRUD view to add/edit Spa Services (name, description, price, duration_mins,
image_url). Include an '86 / Out of Service' toggle switch updating is_available in real
time.
2. Create a Therapist Management section to add/edit therapists and toggle an is_on_call
boolean flag."
Prompt 2.3 — Guest Spa Booking Funnel & 10-Min Hold (Next.js)
"In apps/web under /app/stay/spa:
1. Service Selector: Render a visual grid of Spa services showing title, duration, price, and
image.
2. Time Slot Picker: Filter out times where spa_slot_locks has an active 'HELD' or 'BOOKED'
status.
3. 10-Minute Lock: When a slot is tapped, insert a row into spa_slot_locks (status = 'HELD',
expires_at = NOW() + 10 mins). Display a hold countdown banner.
4. Intake & Confirmation: Collect intake notes, insert a row into requests (request_type =
'SPA_BOOKING'), and update slot status to 'BOOKED'."
Prompt 2.4 — On-Call Therapist Overflow Handling
"In apps/web in the Spa funnel: Check if all in-house therapists are booked for a selected slot. If
full, render the slot with label: 'Request On-Call Therapist (Requires Confirmation)'. Explain the

process in a modal and insert the request with status = 'PENDING_ON_CALL'."
Prompt 2.5 — Staff Spa Dispatch & Confirmation (Expo)
"In apps/staff-app: Render SPA_BOOKING cards displaying Room Number, Service Name,
Requested Time, Duration, and Intake Notes. For PENDING_ON_CALL requests, highlight the
ticket in yellow with 'Approve & Confirm' and 'Decline Request' action buttons."
Prompt 2.6 — Real-Time Spa Status Listener
"In apps/web, update the Guest Active Requests banner to listen via Supabase Realtime for
updates to their SPA_BOOKING request. When status updates to 'CONFIRMED', display a
green confirmation banner. If 'DECLINED', display an alert to select another time."
️ Phase 3: The Food & Beverage Vertical Slice
Prompt 3.1 — F&B Catalog & Orders Schema
"Write PostgreSQL scripts for Supabase to support F&B:
1. Extend catalog_items to support: department = 'F_AND_B', category TEXT, dietary_tags
TEXT[], sort_order INT default 0, is_available BOOLEAN default TRUE.
2. Ensure requests table supports request_type = 'FOOD_ORDER' with a payload JSONB
column holding order_type ('ROOM_SERVICE' | 'DINE_IN'), items array,
special_instructions, delivery_preference, and target_arrival_time."
Prompt 3.2 — Admin F&B Catalog & 86 Toggle (Next.js)
"In apps/web under /app/admin/fb:
1. Create a menu management interface to manage F&B categories and items (name,
description, price, category, dietary tags, image upload).
2. Add an '86 / Out of Stock' instant toggle switch that updates is_available in real time.
3. Implement drag-and-drop or numerical sorting for sort_order."
Prompt 3.3 — Guest Menu & LocalStorage Cart (Next.js)
"In apps/web under /app/stay/dining:
1. Sticky Category Bar: Horizontal scrolling list pinned to the top that highlights active
sections during scrolling.
2. Menu Grid: Render available items with dietary tags and prices.
3. LocalStorage Cart: Cart state functions (addToCart, removeFromCart, clearCart) synced
to localStorage.
4. Floating Cart Bar: Fixed bottom bar showing item count and total price whenever
cartItems.length > 0."
Prompt 3.4 — Guest Checkout & Dine-In Toggle (Next.js)
"In apps/web under /app/stay/dining/checkout:

1. Cart review with quantity adjusters and special instructions text field.
2. Fulfillment Toggle:
○ Room Service: Shows 'Delivery Preference' ('Hand to Me' vs 'Leave at Door').
○ Dine-In (Pre-Order): Shows 'Estimated Arrival Time' selector ('In 15 mins', 'In 30
mins', 'Custom').
3. Submit Order: Insert row into requests (request_type = 'FOOD_ORDER'), clear
localStorage, and redirect to active status tracker."
Prompt 3.5 — Kitchen / Host Stand Ticket Screen (Expo)
"In apps/staff-app: Render FOOD_ORDER cards showing room number, item list, total price,
and notes. For DINE_IN orders, display a '️ DINE-IN PRE-ORDER' banner and an arrival
countdown timer. Include action buttons: 'Start Preparing' and 'Order / Table Ready'."
Prompt 3.6 — Real-Time Food Tracker
"In apps/web, update the Guest Active Request Banner to listen via Supabase Realtime to their
food order status: PENDING -> 'Order Received', PREPARING -> 'Kitchen is preparing',
RESOLVED (Room Service) -> 'On the Way!', RESOLVED (Dine-In) -> 'Table Ready - Please
Head Down!'."
️ Phase 4: Room Requests & Task Routing Vertical
Slice
Prompt 4.1 — Task Schema & Departmental Metadata
"Write PostgreSQL scripts for Supabase to support Task Requests:
1. Extend catalog_items for department = 'ROOM_REQUEST' with priority ('LOW',
'MEDIUM', 'HIGH', 'URGENT'), target_sla_mins INT, and target_department
('HOUSEKEEPING', 'MAINTENANCE', 'FRONT_DESK').
2. Support request_type = 'TASK' in requests table with JSONB payload (task_name,
quantity, custom_notes, priority, target_department).
3. Create an sla_escalations table (id UUID, request_id FK, escalation_level INT,
triggered_at TIMESTAMPTZ default NOW())."
Prompt 4.2 — Admin Request Builder & SLA Configuration (Next.js)
"In apps/web under /app/admin/requests:
1. Build an admin manager to define guest request buttons (item name, icon, category,
default priority, target department, target SLA mins).
2. Add an 'Active / Disabled' toggle for each item.
3. Add an SLA configuration view to set global target response times per department."
Prompt 4.3 — Guest 1-Tap Grid & Custom Request Fallback (Next.js)
"In apps/web under /app/stay/requests:
1. Categorized Grid: Visual grid of request buttons grouped by department using icons.

2. Quantity & Notes Modal: Bottom sheet with + / - counter and optional notes field.
3. Custom Request Fallback: 'Other Request' button opening a freeform text input.
4. Insert row into requests (request_type = 'TASK') and redirect to status tracker."
Prompt 4.4 — Staff Departmental Filtering & SLA Timers (Expo)
"In apps/staff-app:
1. Department Filter Bar: Filter tickets by department (All, Housekeeping, Maintenance,
Front Desk).
2. SLA Countdown Timer: Live countdown timer based on created_at + target_sla_mins. If
timer reaches zero, pulse border red with an 'SLA BREACHED' badge.
3. Action Flow: Include 'Claim Task' and 'Mark Resolved' buttons."
Prompt 4.5 — Real-Time Task Tracker
"In apps/web, update the Guest Active Request Banner to listen via Supabase Realtime to task
updates: PENDING -> 'Request Received', CLAIMED -> 'Staff member assigned and heading to
room', RESOLVED -> 'Task Completed!'."
📊 Phase 5: Analytics, SLA Escalations & Audit Logs
Prompt 5.1 — Database Audit Logging & Scheduled SLA Triggers
"Write PostgreSQL scripts for Supabase:
1. audit_logs table (id UUID, request_id FK, action TEXT, actor_id UUID nullable, details
JSONB, created_at TIMESTAMPTZ).
2. Audit Trigger: PostgreSQL function writing an audit log whenever requests is created or
status updates.
3. Scheduled Function: Function check_sla_breaches() checking for status = 'PENDING'
where NOW() - created_at > target_sla_mins. Writes an escalation record to audit_logs
and updates status = 'ESCALATED_L1'."
Prompt 5.2 — Admin Audit Log Viewer (Next.js)
"In apps/web under /app/admin/audit:
1. Build a read-only, filterable data table displaying audit_logs (Filter by Room Number,
Request Type, Action, Date Range).
2. Detailed View Modal: Clicking any row opens a modal showing the complete timestamped
timeline of events for that ticket to settle guest complaints."
Prompt 5.3 — Executive ROI Analytics Dashboard (Next.js)
"In apps/web under /app/admin/analytics: Build an executive dashboard using a charting library:
1. KPI Cards: Total Revenue, Average Order Value (AOV), Average Time to Acknowledge
(TTA), SLA Compliance Rate (%).
2. Revenue Chart: Line chart comparing F&B vs. Spa daily revenue over time.
3. Departmental SLA Breach Chart: Bar chart of SLA breaches broken down by department.

4. Export CSV button for reporting data."
Prompt 5.4 — Staff App Escalation Banners (Expo)
"In apps/staff-app: Listen via Supabase Realtime for requests where status = 'ESCALATED_L1'
or 'ESCALATED_L2'. Render a bold flashing red banner across overdue tickets: '⚠️ OVERDUE
- ESCALATED TO MANAGER' and move them

 
Live Voice Call Feature — Current Flow Analysis
Architecture Overview

┌─────────────────────────────────────────────────────────────────────────────┐
│                           LIVE VOICE CALL FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GUEST (Web)                    SUPABASE                    STAFF (Native)  │
│  ────────────                    ────────                    ─────────────  │
│       │                           │                            │             │
│       ▼                           │                            │             │
│  1. Tap "Live Voice Call"         │                            │             │
│       │                           │                            │             │
│       ▼                           │                            │             │
│  2. INSERT request:               │                            │             │
│     - request_type: 'LIVE_CALL'   │                            │             │
│     - agora_channel:              │                            │             │
│       'livecall-${requestId}'     │                            │             │
│     - status: 'PENDING'           │                            │             │
│       │                           │                            │             │
│       ▼                           ▼                            │             │
│       │                    3. DB Trigger                      │             │
│       │                    ──► /api/push/webhook               │             │
│       │                           │                            │             │
│       │                           ▼                            │             │
│       │                    4. FCM Push to ALL                 │             │
│       │                    staff devices with                 │             │
│       │                    agora_channel in payload           │             │
│       │                           │                            │             │
│       ▼                           │                            ▼             │
│  5. Subscribe to              │                    6. IncomingLiveCallAlert  │
│     request updates           │                    shows (45s timer)       │
│       │                       │                            │              │
│       │                       │                    7. Staff taps "Answer"   │
│       ▼                       ▼                            ▼              │
│  8. Status → 'LIVE'    ◄───────┘                    9. Fetch token        │
│       │                                            from Vercel API         │
│       ▼                                                          │         │
│  10. GuestVoiceCallEngine                                   ▼         │
│     joins Agora (UID=1)                              10. joinChannel    │
│                                                            (UID=2)         │
│       │                                                          │         │
│       ▼                                                          ▼         │
│  11. Bidirectional audio ◄────────────────────────────────────────┘        │
│                                                                             │
│  12. Either party ends call                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  13. leaveChannel() + UPDATE request status='RESOLVED'                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
🔍 Current Implementation Review
Strengths
Area	Implementation
Signaling	Supabase Realtime + FCM push (works on web & native)
Token Security	Server-side token generation with agora-access-token, 24h expiry
UID Strategy	Fixed: Guest=1, Staff=2 (prevents conflicts)
Native Audio	react-native-incall-manager for speaker/proximity routing
UI/UX	Animated incoming call overlay, floating active call bar
OTA Ready	All JS/TS changes deployable via eas update
Critical Gaps & Risks (High Priority)
#	Issue	Impact	Location
1	No concurrent call handling — Multiple guests calling simultaneously → all alerts fire, staff can only answer one; others hang indefinitely	Guest frustration, missed calls	App.tsx (lines 319-323), IncomingLiveCallAlert
2	No reconnection logic — Network drop = call ends permanently, no auto-rejoin	Dropped calls in poor WiFi	GuestVoiceCallEngine.tsx, useStaffVoiceCall.native.ts
3	24-hour static tokens — Same token reusable; no per-call rotation; if APP_CERTIFICATE missing, runs in insecure "testing mode"	Security risk, token reuse	/api/agora/token/route.ts
4	No call state persistence — App crash/restart during call loses state; no recovery	Data loss, inconsistent DB status	App.tsx, no local persistence
5	No staff availability/busy state — Staff on another call still receives new alerts	Double-ringing, confusion	No availability tracking
6	45s auto-dismiss too aggressive — Busy staff may miss call; no "snooze" or "call back"	Missed calls	IncomingLiveCallAlert.tsx:19
7	No call quality monitoring — No network stats, audio level, MOS score	Can't diagnose quality issues	Both engines
8	No audit trail for calls — No audit_logs entries for call start/end/duration	Compliance gap	App.tsx:411 only updates to RESOLVED
9	Race condition on channel creation — agora_channel = livecall-${requestId} generated client-side; two simultaneous requests could collide if requestId generation has issues	Channel collision	CallFrontDeskModal.tsx:143
10	No fallback to PSTN — If Agora fails (blocked ports, firewall), no automatic fallback to regular phone call	Complete call failure	CallFrontDeskModal has manual fallback only
🚀 Enhancement Plan (Prioritized)
Phase 1: Core Reliability (Week 1-2)
1.1 Call Queue & Concurrency Management

// New: apps/staff-app/lib/callQueue.ts
interface QueuedCall {
  requestId: string
  channel: string
  roomNumber: string
  timestamp: number
  priority: 'normal' | 'high'
}

class CallQueue {
  private queue: QueuedCall[] = []
  private activeCallId: string | null = null
  
  enqueue(call: QueuedCall) { ... }
  dequeue(): QueuedCall | null { ... }
  setActive(requestId: string) { this.activeCallId = requestId }
  clearActive() { this.activeCallId = null }
  getWaitingCount(): number { return this.queue.length }
  isStaffBusy(): boolean { return !!this.activeCallId }
}
Integration: In App.tsx, check callQueue.isStaffBusy() before showing new IncomingLiveCallAlert. Queue incoming calls; auto-present next when current ends.

1.2 Reconnection Logic (Both Sides)

// GuestVoiceCallEngine.tsx — add to useEffect
client.on('connection-state-change', (state) => {
  if (state === 'DISCONNECTED') {
    // Attempt reconnect with exponential backoff
    attemptReconnect(channel, token, 1, 3) // max 3 retries
  }
})

// useStaffVoiceCall.native.ts — add engine event handler
onConnectionLost: () => {
  // Auto-rejoin with same token (valid 24h)
  setTimeout(() => joinChannel(channel, token, appId), 2000)
}
1.3 Per-Call Short-Lived Tokens (Security)

// /api/agora/token/route.ts — reduce expiry to call duration + buffer
const CALL_DURATION_LIMIT = 30 * 60 // 30 minutes
const expirySeconds = CALL_DURATION_LIMIT + 300 // +5 min buffer
const privilegeExpiredTs = currentTimestamp + expirySeconds
Phase 2: Observability & Quality (Week 2-3)
2.1 Call Quality Monitoring

// Add to both engines
client.on('network-quality', (stats) => {
  // stats: { uplinkNetworkQuality, downlinkNetworkQuality, ... }
  // 1=Excellent, 2=Good, 3=Poor, 4=Bad, 5=Very Bad, 6=Down
  updateQualityIndicator(stats.downlinkNetworkQuality)
})

client.on('audio-volume-indication', (speakers) => {
  // speakers: { uid, volume, vad }[]
  updateAudioLevelUI(speakers)
})
2.2 Call Audit Logging

-- New migration: 25_call_audit_log.sql
CREATE TABLE call_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES requests(id),
  hotel_id UUID NOT NULL,
  guest_uid INTEGER NOT NULL DEFAULT 1,
  staff_uid INTEGER NOT NULL DEFAULT 2,
  agora_channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  end_reason TEXT, -- 'guest_ended' | 'staff_ended' | 'network_drop' | 'error'
  quality_stats JSONB, -- { avg_rtt, packet_loss, mos_score }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_call_audit_hotel_time ON call_audit_logs(hotel_id, started_at DESC);
Trigger from App: On leaveChannel() / endCall(), insert audit record.

Phase 3: Advanced Features (Week 3-4)
3.1 Staff Availability & Presence

// New: apps/staff-app/lib/staffPresence.ts
// Track: available / on_call / away / offline
// Broadcast via Supabase Realtime presence channel
// Guest sees "Staff available" / "Staff busy" indicator
3.2 Call Transfer

// ActiveCallBar.tsx — add "Transfer" button
// Flow: Staff A → taps transfer → selects Staff B → 
//       Staff B gets incoming alert with "Transfer from [Name]"
//       On answer: Staff A leaves, Staff B takes over
3.3 PSTN Fallback

// CallFrontDeskModal.tsx — if Agora join fails 3x:
if (agoraErrorCount >= 3) {
  setStatus('FAILED')
  showFallbackUI: "Voice call unavailable. Tap to call front desk directly via phone."
  // Uses existing tel: link
}
📋 Implementation Checklist
Priority	Task	Files to Modify	Est. Effort
P0	Call queue & concurrency handling	App.tsx, new callQueue.ts, IncomingLiveCallAlert.tsx	1.5 days
P0	Reconnection logic (both engines)	GuestVoiceCallEngine.tsx, useStaffVoiceCall.native.ts	1 day
P0	Short-lived per-call tokens	/api/agora/token/route.ts	0.5 day
P1	Call audit logging (migration + integration)	New migration, App.tsx, GuestVoiceCallEngine.tsx	1 day
P1	Network quality + audio level UI	Both engines, ActiveCallBar.tsx, CallFrontDeskModal.tsx	1 day
P2	Staff presence/availability	New staffPresence.ts, App.tsx, guest UI	1.5 days
P2	Call transfer feature	ActiveCallBar.tsx, App.tsx, new transfer logic	1.5 days
P2	PSTN fallback on Agora failure	CallFrontDeskModal.tsx, GuestVoiceCallEngine.tsx	0.5 day
P3	Call recording (optional, legal review)	New Agora Cloud Recording integration	2+ days
🛡️ Deployment Safety Notes
Change Type	Deployment Method
Token expiry change	OTA (eas update) — JS only
Reconnection logic	OTA — JS only
Call queue logic	OTA — JS only
Audit logging migration	Manual Supabase — Run SQL in dashboard
Staff presence (new table)	Manual Supabase + OTA
Call transfer	OTA — JS only
PSTN fallback	OTA — JS only
