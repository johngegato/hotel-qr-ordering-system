import AsyncStorage from '@react-native-async-storage/async-storage'
import { StaffUser } from '../components/UserManagement'

const STAFF_SESSION_KEY = '@hotel_qr_staff_session_v1'

/**
 * Save staff user session to persistent local storage (survives app kill / close).
 */
export async function saveStaffSession(user: StaffUser): Promise<void> {
  try {
    const payload = JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      savedAt: new Date().toISOString(),
    })
    await AsyncStorage.setItem(STAFF_SESSION_KEY, payload)
  } catch (error) {
    console.warn('[authStorage] Failed to save staff session:', error)
    // Web fallback if AsyncStorage throws
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(user))
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Retrieve saved staff user session from persistent local storage.
 */
export async function getSavedStaffSession(): Promise<StaffUser | null> {
  try {
    let raw = await AsyncStorage.getItem(STAFF_SESSION_KEY)
    if (!raw && typeof window !== 'undefined' && window.localStorage) {
      raw = window.localStorage.getItem(STAFF_SESSION_KEY)
    }

    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (parsed && parsed.id && parsed.name && parsed.email) {
      return {
        id: parsed.id,
        name: parsed.name,
        email: parsed.email,
        role: parsed.role || 'STAFF',
      }
    }
    return null
  } catch (error) {
    console.warn('[authStorage] Failed to read staff session:', error)
    return null
  }
}

/**
 * Clear saved staff session (called on Log Out).
 */
export async function clearStaffSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STAFF_SESSION_KEY)
  } catch (error) {
    console.warn('[authStorage] Failed to clear staff session from AsyncStorage:', error)
  }

  // Web fallback cleanup
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STAFF_SESSION_KEY)
    } catch {
      // ignore
    }
  }
}
