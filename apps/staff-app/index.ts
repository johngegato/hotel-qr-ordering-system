import 'react-native-url-polyfill/auto';

// Global error handler for React Native runtime stability
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  const defaultHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    console.error('[Global ErrorUtils Caught]:', error, 'isFatal:', isFatal);
    if (defaultHandler) {
      try {
        defaultHandler(error, isFatal);
      } catch {
        // prevent secondary handler failure
      }
    }
  });
}

// ─── Notifee: Register handlers at module level (BEFORE registerRootComponent) ─
// These MUST be registered here — Notifee requires module-level registration
// so they fire even when the app is killed or the screen is locked.

import { initForegroundService } from './lib/foregroundService';
import { registerBackgroundNotificationHandler } from './lib/notifications';

// 1. Register the Foreground Service task handler
//    → Runs the Supabase realtime subscription loop that keeps WebSocket alive
//    → Fires Full-Screen Intent when a new PENDING request arrives
initForegroundService();

// 2. Register the background notification event handler
//    → Handles "✓ ACKNOWLEDGE" button press when app is killed
//    → Cancels the looping alarm sound
registerBackgroundNotificationHandler();

// ─────────────────────────────────────────────────────────────────────────────

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
