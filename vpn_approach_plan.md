# Always-On VPN Approach — Analysis & Plan

## Can it work on this repo?

**Short answer: Yes, but it requires native Android code and a bare Expo workflow.**

---

## Why notifications die after screen-off

Your current stack already has:
- ✅ Notifee Foreground Service (`startStaffMonitoringService`)
- ✅ 90-second REST watchdog loop (`runBackgroundWatchdogCheck`)
- ✅ FCM high-priority push (`priority: 'high'`, `channelId: 'hotel_staff_alarm'`)
- ✅ WakeLock + Full-Screen Intent
- ✅ Battery optimization prompt on login

The issue is **OEM-level process killing** (Samsung One UI, Xiaomi MIUI, etc.) that goes BEYOND Android's standard Doze. These OEMs have their own aggressive process managers that kill even foreground services after a few minutes of screen-off.

---

## What Always-On VPN Actually Does

Android's Always-On VPN feature (`VpnService`) runs at the **kernel network layer**. The OS guarantees:
1. The VPN process is **never killed** — it gets `START_STICKY` + OEM whitelisting
2. It is **automatically restarted** if it crashes
3. OEM battery killers **cannot touch it** (it's treated as system-level)
4. All network traffic routes through it (but you make it a passthrough — no actual VPN)

This is used in production by apps like Signal and some MDM solutions.

---

## What's Required to Implement It

### 1. Expo Bare Workflow (one-time)
Your app currently uses managed Expo. You need to eject to bare:
```bash
cd apps/staff-app
npx expo prebuild --platform android
```
This generates the `android/` native folder.

### 2. Native VpnService (Java/Kotlin)
Create `android/app/src/main/java/com/hotelqr/staffapp/HotelVpnService.java`:
- Extends `android.net.VpnService`
- Builds a passthrough TUN interface (no actual traffic interception)
- Calls back into React Native via a HeadlessJS task or BroadcastReceiver

### 3. AndroidManifest.xml additions
```xml
<service android:name=".HotelVpnService"
    android:permission="android.permission.BIND_VPN_SERVICE">
  <intent-filter>
    <action android:name="android.net.VpnService"/>
  </intent-filter>
</service>
<uses-permission android:name="android.permission.BIND_VPN_SERVICE"/>
```

### 4. React Native bridge
A native module to start/stop the VPN service from JS on staff login/logout.

---

## Trade-offs

| Factor | Always-On VPN | Current Foreground Service |
|---|---|---|
| Kill-proof | ✅ Yes (kernel level) | ⚠️ OEMs can kill it |
| Setup complexity | ❌ High (native Android code) | ✅ Already done |
| User experience | ⚠️ VPN icon in status bar | ✅ Clean |
| Staff confusion | ⚠️ "Why is VPN on?" | ✅ None |
| Restart on boot | ✅ Yes | ✅ Already have RECEIVE_BOOT_COMPLETED |
| Works on all OEMs | ✅ Yes | ⚠️ Samsung/Xiaomi can bypass |

---

## Simpler Fix to Try FIRST (Before VPN)

The most common reason foreground services die on Samsung/Xiaomi despite being configured correctly is missing the **`FOREGROUND_SERVICE_REMOTE_MESSAGING`** service type declaration. Try adding this to `app.json` first — it may solve the problem without native code.

