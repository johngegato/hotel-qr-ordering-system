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

// ─── Notifee Background Event Handler ─────────────────────────────────────────
// MUST be registered here (module level) before registerRootComponent.
// This fires when the app is in the background or completely killed:
//  - Staff taps "✓ ACKNOWLEDGE" on the lock-screen Full-Screen Intent → alarm stops
//  - Staff taps the notification banner in the notification shade → app opens
import { registerBackgroundNotificationHandler } from './lib/notifications';
registerBackgroundNotificationHandler();
// ──────────────────────────────────────────────────────────────────────────────

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);

