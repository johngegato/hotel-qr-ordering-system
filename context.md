

 
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
