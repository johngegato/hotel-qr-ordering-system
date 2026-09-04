import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnReconnect } from './networkMonitor'

export interface UseStaffVoiceCallOptions {
  onCallEnded?: () => void
  channel?: string
  token?: string | null
  appId?: string
}

export interface StaffVoiceCallState {
  isConnected: boolean
  isMuted: boolean
  isSpeakerOn: boolean
  callDurationSeconds: number
  isReconnecting: boolean
  joinChannel: (channel: string, token: string | null, appId: string) => Promise<void>
  leaveChannel: () => Promise<void>
  toggleMute: () => void
  toggleSpeaker: () => void
}

/**
 * Native Android & iOS implementation of Agora voice calling for staff-app.
 * Uses `react-native-agora` + `react-native-incall-manager`.
 * Staff always joins as UID=2.
 * Includes auto-reconnection on network recovery.
 */
export function useStaffVoiceCall({ onCallEnded, channel, token, appId }: UseStaffVoiceCallOptions = {}): StaffVoiceCallState {
  const engineRef = useRef<any>(null)
  const channelRef = useRef(channel)
  const tokenRef = useRef(token)
  const appIdRef = useRef(appId)
  const reconnectAttemptRef = useRef(0)
  const maxReconnectAttempts = 3
  const reconnectDelayMs = 2000

  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [callDurationSeconds, setCallDurationSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep refs updated
  useEffect(() => { channelRef.current = channel }, [channel])
  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { appIdRef.current = appId }, [appId])

  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setCallDurationSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setCallDurationSeconds(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isConnected])

  // Auto-reconnect on network recovery
  useOnReconnect(async () => {
    if (channelRef.current && tokenRef.current && appIdRef.current && !isConnected && !isReconnecting) {
      console.log('[StaffVoiceCall:Native] Network recovered, attempting to rejoin...')
      try {
        await doJoinChannel()
      } catch (err) {
        console.error('[StaffVoiceCall:Native] Rejoin failed:', err)
      }
    }
  })

  const doJoinChannel = useCallback(async () => {
    try {
      const agoraMod = await import('react-native-agora')
      const InCallManagerMod = await import('react-native-incall-manager')
      const InCallManager = InCallManagerMod.default ?? InCallManagerMod

      const createEngine = (agoraMod as any).default || (agoraMod as any).createAgoraRtcEngine
      const engine = typeof createEngine === 'function' ? createEngine() : null
      if (!engine) throw new Error('Could not create Agora RTC engine')

      engineRef.current = engine

      if (typeof engine.initialize === 'function') {
        engine.initialize({ appId: appIdRef.current })
      }

      if (typeof engine.enableAudio === 'function') {
        engine.enableAudio()
      }
      if (typeof engine.disableVideo === 'function') {
        engine.disableVideo()
      }
      if (typeof engine.setEnableSpeakerphone === 'function') {
        engine.setEnableSpeakerphone(true)
      }

      if (typeof engine.registerEventHandler === 'function') {
        engine.registerEventHandler({
          onJoinChannelSuccess: (_connection: any, _elapsed: number) => {
            console.log('[StaffVoiceCall:Native] Successfully joined channel')
            setIsConnected(true)
            setIsReconnecting(false)
            reconnectAttemptRef.current = 0
          },
            onError: (err: any, _msg: any) => {
              console.error('[StaffVoiceCall:Native] Engine error:', err, _msg)
              setIsConnected(false)
              if (!isReconnecting) onCallEnded?.()
            },
            onUserJoined: (_connection: any, uid: number) => {
              console.log('[StaffVoiceCall:Native] Remote user joined:', uid)
              setIsConnected(true)
            },
            onUserOffline: (_connection: any, uid: number) => {
              console.log('[StaffVoiceCall:Native] Remote user left:', uid)
              setIsConnected(false)
              onCallEnded?.()
            },
            onConnectionLost: () => {
              console.warn('[StaffVoiceCall:Native] Connection lost')
              setIsConnected(false)
              setIsReconnecting(true)
            },
            onRejoinChannelSuccess: () => {
              console.log('[StaffVoiceCall:Native] Rejoined channel successfully')
              setIsConnected(true)
              setIsReconnecting(false)
              reconnectAttemptRef.current = 0
            },
          })
        } else if (typeof engine.addListener === 'function') {
          engine.addListener('JoinChannelSuccess', () => {
            console.log('[StaffVoiceCall:Native] Successfully joined channel')
            setIsConnected(true)
          })
          engine.addListener('UserJoined', (uid: number) => {
            console.log('[StaffVoiceCall:Native] Remote user joined:', uid)
            setIsConnected(true)
          })
          engine.addListener('UserOffline', (uid: number) => {
            console.log('[StaffVoiceCall:Native] Remote user left:', uid)
            setIsConnected(false)
            onCallEnded?.()
          })
          engine.addListener('Error', (err: any, _msg: any) => {
            console.error('[StaffVoiceCall:Native] Engine error:', err, _msg)
            setIsConnected(false)
            if (!isReconnecting) onCallEnded?.()
          })
          engine.addListener('ConnectionLost', () => {
            console.warn('[StaffVoiceCall:Native] Connection lost')
            setIsConnected(false)
            setIsReconnecting(true)
          })
          engine.addListener('RejoinChannelSuccess', () => {
            console.log('[StaffVoiceCall:Native] Rejoined channel successfully')
            setIsConnected(true)
            setIsReconnecting(false)
            reconnectAttemptRef.current = 0
          })
        }

        if (typeof engine.setChannelProfile === 'function') {
          engine.setChannelProfile((agoraMod as any).ChannelProfileType?.ChannelProfileCommunication ?? 0)
        }
        if (typeof engine.setClientRole === 'function') {
          engine.setClientRole((agoraMod as any).ClientRoleType?.ClientRoleBroadcaster ?? 1)
        }

        // Staff always joins as UID=2. react-native-agora v4 signature:
        // joinChannel(token, channelId, uid, options)
        if (typeof engine.joinChannel === 'function') {
          const joinResult = engine.joinChannel(token ?? '', channel, 2, {
            clientRoleType: (agoraMod as any).ClientRoleType?.ClientRoleBroadcaster ?? 1,
            channelProfile: (agoraMod as any).ChannelProfileType?.ChannelProfileCommunication ?? 0,
            publishMicrophoneTrack: true,
            publishCameraTrack: false,
            autoSubscribeAudio: true,
            autoSubscribeVideo: false,
          })
          if (typeof joinResult === 'number' && joinResult < 0) {
            throw new Error(`Agora joinChannel failed with code ${joinResult}`)
          }
        }

        // Start in-call audio mode (proximity sensor, speaker routing)
        if (InCallManager && typeof InCallManager.start === 'function') {
          InCallManager.start({ media: 'audio', auto: true, ringback: '' })
          if (typeof InCallManager.setForceSpeakerphoneOn === 'function') {
            InCallManager.setForceSpeakerphoneOn(true)
          }
        }

        setIsConnected(true)
        setIsMuted(false)
        setIsSpeakerOn(true)
      } catch (err) {
        console.error('[StaffVoiceCall:Native] Join error:', err)
        throw err
      }
    },
    [onCallEnded]
  )

  // Wrapper with retry logic for initial join
  const joinChannel = useCallback(
    async (channel: string, token: string | null, appId: string) => {
      let lastError: Error | null = null
      for (let attempt = 0; attempt <= maxReconnectAttempts; attempt++) {
        try {
          reconnectAttemptRef.current = attempt
          await doJoinChannel()
          return
        } catch (err) {
          lastError = err as Error
          console.warn(`[StaffVoiceCall:Native] Join attempt ${attempt + 1} failed:`, err)
          if (attempt < maxReconnectAttempts) {
            await new Promise((r) => setTimeout(r, reconnectDelayMs * (attempt + 1)))
          }
        }
      }
      throw lastError ?? new Error('Failed to join channel after retries')
    },
    [doJoinChannel]
  )

  const leaveChannel = useCallback(async () => {
    try {
      const InCallManagerMod = await import('react-native-incall-manager')
      const InCallManager = InCallManagerMod.default ?? InCallManagerMod
      if (InCallManager && typeof InCallManager.stop === 'function') {
        InCallManager.stop()
      }
      if (engineRef.current) {
        if (typeof engineRef.current.leaveChannel === 'function') {
          await engineRef.current.leaveChannel()
        }
        if (typeof engineRef.current.release === 'function') {
          engineRef.current.release()
        } else if (typeof engineRef.current.destroy === 'function') {
          engineRef.current.destroy()
        }
        engineRef.current = null
      }
    } catch (err) {
      console.warn('[StaffVoiceCall:Native] Leave error:', err)
    } finally {
      setIsConnected(false)
      onCallEnded?.()
    }
  }, [onCallEnded])

  const toggleMute = useCallback(async () => {
    const next = !isMuted
    if (engineRef.current && typeof engineRef.current.muteLocalAudioStream === 'function') {
      await engineRef.current.muteLocalAudioStream(next)
    }
    setIsMuted(next)
  }, [isMuted])

  const toggleSpeaker = useCallback(async () => {
    const next = !isSpeakerOn
    if (engineRef.current && typeof engineRef.current.setEnableSpeakerphone === 'function') {
      await engineRef.current.setEnableSpeakerphone(next)
    }
    setIsSpeakerOn(next)
  }, [isSpeakerOn])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (engineRef.current) {
        try {
          if (typeof engineRef.current.leaveChannel === 'function') {
            engineRef.current.leaveChannel()
          }
          if (typeof engineRef.current.release === 'function') {
            engineRef.current.release()
          } else if (typeof engineRef.current.destroy === 'function') {
            engineRef.current.destroy()
          }
        } catch { /* ignore */ }
      }
    }
  }, [])

  return {
    isConnected,
    isMuted,
    isSpeakerOn,
    isReconnecting,
    callDurationSeconds,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleSpeaker,
  }
}
