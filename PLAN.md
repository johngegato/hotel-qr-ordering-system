# Voice Call Fixes — Technical Blueprint

> This document captures the bugs uncovered during voice call review and the engineering plan to resolve them.

---

## 🔴 Critical Bugs

### Bug 1: `callQueue.setActive` is undefined (Live call always fails)

**Location:** `apps/staff-app/App.tsx:422`

**Symptom:** Staff "Answer" tap shows `Alert.alert('Call Failed', ...)` every time because `callQueue.setActive` is never defined.

**Root cause:** The `callQueue` class in `apps/staff-app/lib/callQueue.ts` does not export a `setActive` method, but `App.tsx` calls it (line 422).

**Fix Options:**

| Option | Action | Files |
|--------|--------|-------|
| A (recommended) | Remove the call. The request is already active because it was dequeued. | edit `apps/staff-app/App.tsx` |
| B | Add the method to CallQueue class. | edit `apps/staff-app/lib/callQueue.ts` |

**Recommended Fix (A)** – delete the `callQueue.setActive` call since `dequeue()` already set `activeCallId`:

**apps/staff-app/App.tsx:421-423**  
Delete these lines:
```ts
// Mark as active in queue BEFORE joining (prevents race conditions)
callQueue.setActive(reqId)
```

---

### Bug 2: Staff cannot join Agora channel in certificate-less (testing) mode

**Location:** `apps/staff-app/App.tsx:417`

**Symptom:** When `AGORA_APP_CERTIFICATE` env var is missing, `/api/agora/token` returns `token: null`. The native hook throws:
```ts
if (!tokenRes.ok || !tokenData?.token) {
  throw new Error(tokenData?.error || 'Missing Agora token')
}
```
→ staff call fails before Agora even tries to join.

**Fix:** Accept `null` token for testing mode only.

**apps/staff-app/App.tsx lines 414-418**  
Replace:
```ts
if (!tokenRes.ok || !tokenData?.token) {
  throw new Error(tokenData?.error || 'Missing Agora token')
}
```
With:
```ts
if (!tokenRes.ok) {
  throw new Error(tokenData?.error || 'Token request failed')
}
// token may be null in testing mode; Agora SDK handles it
```

---

## 🟡 High Bugs

### Bug 3: No timeout when staff does not answer → guest audio leaks

**Locations:**  
- `apps/web/app/app/stay/components/IncomingLiveCallAlert.tsx` (45s auto-dismiss → `DECLINED`)  
- `apps/web/app/app/stay/components/CallFrontDeskModal.tsx`

**Problem:** Guest's `LIVE_CALL` modal only handles these realtime status changes:
```ts
if (payload.new?.status === 'CLAIMED') { setStatus('CLAIMED') }
if (payload.new?.status === 'LIVE')     { setStatus('VOICE_LIVE') }
if (payload.new?.status === 'RESOLVED') { setStatus('VOICE_ENDED') }
```
`DECLINED` or timeout is NOT handled. After 45s staff auto-decline, the guest remains in `VOICE_LIVE` with live mic, Agora minutes accumulating.

**Fix:** Add timeout + DECLINED handling in `apps/web/app/app/stay/components/CallFrontDeskModal.tsx`:

1. Add new status type:
```ts
type Status = 'IDLE' | 'PENDING' | 'CLAIMED' | 'FAILED' | 'DECLINED' | 'VOICE_JOINING' | 'VOICE_LIVE' | 'VOICE_ENDED'
```

2. Add useEffect for pending timeout (runs once):
```ts
useEffect(() => {
  let timer: NodeJS.Timeout
  if (status === 'PENDING') {
    timer = setTimeout(() => {
      if (requestId) supabase.from('requests').update({ status: 'DECLINED' }).eq('id', requestId)
      setStatus('DECLINED')
    }, 45 * 1000)
  }
  return () => clearTimeout(timer)
}, [status, requestId])
```

3. Handle DECLINED in realtime subscription:
```ts
if (payload.new?.status === 'RESOLVED' || payload.new?.status === 'DECLINED') {
  setStatus('VOICE_ENDED')
  voiceCall.endCall()
}
```

4. Add DECLINED UI section (after CLAIMED section):
```tsx
{status === 'DECLINED' && (
  <div className="text-center py-6 space-y-4">
    <div className="text-4xl">🚪</div>
    <p className="text-amber-400 text-sm font-semibold">Call declined or timed out</p>
    <button onClick={onClose} className="w-full py-4 rounded-2xl font-bold">Close</button>
  </div>
)}
```

---

### Bug 4: Push webhook filter uses `&&` logic (duplicate pushes possible)

**Location:** `apps/web/app/api/push/webhook/route.ts:24`

**Current (buggy):**
```ts
if (eventType !== 'INSERT' && status !== 'PENDING' && status !== 'PENDING_ON_CALL') {
```

**Fix:** Change to use OR:
```ts
if (eventType !== 'INSERT' || (status !== 'PENDING' && status !== 'PENDING_ON_CALL')) {
```

---

### Bug 5: `onError` prematurely kills the call

**Location:** `apps/staff-app/lib/useStaffVoiceCall.native.ts:110-114`

**Problem:** `onError` triggers `onCallEnded?.()` for any error, even recoverable warnings, cutting the call before reconnect can happen.

**Fix:** Gate `onError` with `isReconnecting`:
```ts
onError: (err: any, _msg: any) => {
  console.error('[StaffVoiceCall:Native] Engine error:', err, _msg)
  setIsConnected(false)
  if (!isReconnecting) onCallEnded?.()
},
```

---

## Implementation Checklist

| Priority | Task | Files | Est. Effort |
|----------|------|-------|-------------|
| P0 | ✅ Fix `callQueue.setActive` undefined (applied) | `apps/staff-app/App.tsx` | 5 min |
| P0 | ✅ Allow null token for testing mode (applied) | `apps/staff-app/App.tsx` | 5 min |
| P1 | Add DECLINED/timeout handling | `apps/web/app/app/stay/components/CallFrontDeskModal.tsx` | 1 day |
| P1 | Fix webhook `&&` → `||` logic | `apps/web/app/api/push/webhook/route.ts` | 5 min |
| P1 | Gate `onError` with `isReconnecting` | `apps/staff-app/lib/useStaffVoiceCall.native.ts` | 5 min |

---

## Rollout Order (OTA safe)

1. Fix `callQueue.setActive` undefined  
2. Token null acceptance (staff native)  
3. Webhook filter  
4. `onError` gate  
5. Deploy to staff app (Expo OTA)  
6. Deploy to web (Vercel preview → production)  
7. Monitor push webhook `Ignored` metric for any false negatives after filter fix