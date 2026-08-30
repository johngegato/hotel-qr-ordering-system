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

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);
