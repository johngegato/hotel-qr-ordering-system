import { useEffect, useRef, useState, useCallback } from 'react'
import NetInfo from '@react-native-community/netinfo'

export type NetworkState = 'connected' | 'disconnected' | 'reconnecting'

interface NetworkMonitorState {
  state: NetworkState
  isOnline: boolean
  wasOnline: boolean
  disconnectCount: number
  lastConnectedAt: number | null
  lastDisconnectedAt: number | null
}

type NetworkListener = (state: NetworkMonitorState) => void

class NetworkMonitor {
  private state: NetworkMonitorState = {
    state: 'connected',
    isOnline: true,
    wasOnline: true,
    disconnectCount: 0,
    lastConnectedAt: Date.now(),
    lastDisconnectedAt: null,
  }
  private listeners: Set<NetworkListener> = new Set()
  private unsubscribeNetInfo: (() => void) | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isInitialized = false

  private notify() {
    this.listeners.forEach(l => l(this.state))
  }

  private setState(partial: Partial<NetworkMonitorState>) {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  initialize() {
    if (this.isInitialized) return
    this.isInitialized = true

    // Initial check
    NetInfo.fetch().then(state => {
      this.setState({
        isOnline: state.isConnected ?? true,
        wasOnline: state.isConnected ?? true,
        state: (state.isConnected ?? true) ? 'connected' : 'disconnected',
      })
    })

    // Subscribe to network changes
    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const isOnline = state.isConnected ?? true
      const wasOnline = this.state.wasOnline

      if (isOnline && !wasOnline) {
        // Reconnected
        console.log('[NetworkMonitor] Network reconnected')
        this.setState({
          isOnline: true,
          wasOnline: true,
          state: 'reconnecting',
          lastConnectedAt: Date.now(),
        })
        // Give a moment for connections to stabilize
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.reconnectTimer = setTimeout(() => {
          this.setState({ state: 'connected' })
        }, 1000)
      } else if (!isOnline && wasOnline) {
        // Disconnected
        console.log('[NetworkMonitor] Network disconnected')
        this.setState({
          isOnline: false,
          wasOnline: false,
          state: 'disconnected',
          disconnectCount: this.state.disconnectCount + 1,
          lastDisconnectedAt: Date.now(),
        })
      } else if (isOnline) {
        this.setState({ wasOnline: true })
      } else {
        this.setState({ wasOnline: false })
      }
    })
  }

  destroy() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo()
      this.unsubscribeNetInfo = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.isInitialized = false
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState(): NetworkMonitorState {
    return { ...this.state }
  }

  isConnected(): boolean {
    return this.state.isOnline
  }
}

export const networkMonitor = new NetworkMonitor()

/**
 * React hook for monitoring network state
 */
export function useNetworkMonitor() {
  const [netState, setNetState] = useState<NetworkMonitorState>(networkMonitor.getState())

  useEffect(() => {
    networkMonitor.initialize()
    const unsubscribe = networkMonitor.subscribe(setNetState)
    return unsubscribe
  }, [])

  return netState
}

/**
 * Hook for components that need to perform actions on reconnection
 */
export function useOnReconnect(callback: () => void, deps: React.DependencyList = []) {
  const { state, isOnline, wasOnline } = useNetworkMonitor()
  const prevWasOnlineRef = useRef(wasOnline)

  useEffect(() => {
    // Detect transition from offline to online
    if (!prevWasOnlineRef.current && wasOnline && isOnline) {
      console.log('[useOnReconnect] Triggering reconnection callback')
      callback()
    }
    prevWasOnlineRef.current = wasOnline
  }, [isOnline, wasOnline, ...deps])
}