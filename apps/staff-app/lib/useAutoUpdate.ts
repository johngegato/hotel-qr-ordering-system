import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus, Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * Custom hook for Over-The-Air (OTA) Auto-Updates via expo-updates.
 * - Automatically checks for JS/UI updates on app launch and foreground resume.
 * - Downloads updates in the background.
 * - Prompts staff and reloads the app immediately once downloaded.
 */
export function useAutoUpdate() {
  const isCheckingRef = useRef(false)

  const checkForUpdates = async (triggerReason: string) => {
    // OTA updates only run in production/preview EAS builds (not in __DEV__ or on Web)
    if (__DEV__ || Platform.OS === 'web') {
      return
    }

    if (isCheckingRef.current) return
    isCheckingRef.current = true

    try {
      console.log(`[AutoUpdate] Checking for updates (${triggerReason})...`)
      const update = await Updates.checkForUpdateAsync()

      if (update.isAvailable) {
        console.log('[AutoUpdate] New OTA update found! Downloading update bundle...')
        const fetchResult = await Updates.fetchUpdateAsync()

        if (fetchResult.isNew) {
          console.log('[AutoUpdate] Update downloaded successfully. Prompting restart...')
          Alert.alert(
            '🔄 Update Ready',
            'A new version of the Staff App is ready. Restarting now to apply the latest features and bug fixes.',
            [
              {
                text: 'Restart Now',
                onPress: async () => {
                  try {
                    await Updates.reloadAsync()
                  } catch (err) {
                    console.warn('[AutoUpdate] Reload error:', err)
                  }
                },
              },
            ],
            { cancelable: false }
          )
        }
      } else {
        console.log('[AutoUpdate] Staff App is currently up to date.')
      }
    } catch (error) {
      console.warn(`[AutoUpdate] Update check failed (${triggerReason}):`, error)
    } finally {
      isCheckingRef.current = false
    }
  }

  useEffect(() => {
    // 1. Check on initial app launch / mount
    checkForUpdates('app_launch')

    // 2. Check whenever staff returns to the app from background
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkForUpdates('app_foreground_resume')
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])
}
