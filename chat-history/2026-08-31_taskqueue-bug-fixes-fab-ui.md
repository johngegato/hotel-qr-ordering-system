# Session: 2026-08-31 Part 3 — TaskQueue Bug Fix & FCM FAB UI

**Conversation ID**: 12ee2fdf-f932-4be3-8a00-9f9580a79040  
**Commits**: `2dfe2f9`, `3663c52`

---

## Bug: TaskQueue Always Shows "Room 302"

### Root Cause
In `apps/staff-app/components/TaskQueue.tsx` line 267, the room number text was a **literal hardcoded string**:
```tsx
<Text style={styles.roomText}>Room 302</Text>
```

### Fix
**1. Added rooms join to the Supabase query:**
```ts
// Before
.select('*')

// After
.select('*, rooms(room_number)')
```

**2. Added `rooms` to the TypeScript interface:**
```ts
interface TaskRequest {
  ...
  rooms?: { room_number: string } | null  // ← Added
}
```

**3. Replaced hardcoded text with dynamic value:**
```tsx
<Text style={styles.roomText}>
  Room {item.rooms?.room_number || item.payload?.room_number || item.room_id || '—'}
</Text>
```

The fallback chain ensures something always displays even if the join fails.

---

## UI Fix: FCM Button Cluttering Header

### Problem
The `📡 FCM: OK` button was inside the header row alongside `⚡ Sync` and `↩ Logout`. On small Android screens this caused text overlap and made the header hard to tap.

### Fix: Floating Action Button (FAB)

**Removed from header** — header is now just Sync + Logout.

**Added FAB at bottom-right corner:**
```tsx
<TouchableOpacity
  onPress={() => setShowDiagnosticsModal(true)}
  style={styles.fcmFab}
  activeOpacity={0.85}
>
  <Text style={styles.fcmFabIcon}>📡</Text>
  <Text style={styles.fcmFabText}>
    {pushToken && !pushToken.startsWith('web_pwa_') && !pushToken.startsWith('expo_local_')
      ? 'FCM ✓'
      : 'FCM'}
  </Text>
</TouchableOpacity>
```

**FAB styles:**
```ts
fcmFab: {
  position: 'absolute',
  bottom: 24,
  right: 20,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  borderWidth: 1,
  borderColor: 'rgba(99, 102, 241, 0.45)',
  borderRadius: 50,
  paddingHorizontal: 14,
  paddingVertical: 9,
  shadowColor: '#6366f1',
  elevation: 8,
}
```

The FAB is positioned absolutely outside the ScrollView, so it never overlaps scrollable content.
