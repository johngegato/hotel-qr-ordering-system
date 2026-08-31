import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseStaffVoiceCallOptions {
  onCallEnded?: () => void
}

export interface StaffVoiceCallState {
  isConnected: boolean
  isMuted: boolean
  isSpeakerOn: boolean
  callDurationSeconds: number
  joinChannel: (channel: string, token: string | null, appId: string) => Promise<void>
  leaveChannel: () => Promise<void>
  toggleMute: () => void
  toggleSpeaker: () => void
}

/**
 * Native Android & iOS implementation of Agora voice calling for staff-app.
 * Uses `react-native-agora` + `react-native-incall-manager`.
 * Staff always joins as UID=2.
 */
export function useStaffVoiceCall({ onCallEnded }: UseStaffVoiceCallOptions = {}): StaffVoiceCallState {
  const engineRef = useRef<any>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [callDurationSeconds, setCallDurationSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const joinChannel = useCallback(
    async (channel: string, token: string | null, appId: string) => {
      try {
        const agoraMod = await import('react-native-agora')
        const InCallManagerMod = await import('react-native-incall-manager')
        const InCallManager = InCallManagerMod.default ?? InCallManagerMod

        const createEngine = (agoraMod as any).default || (agoraMod as any).createAgoraRtcEngine
        const engine = typeof createEngine === 'function' ? createEngine() : null
        if (!engine) throw new Error('Could not create Agora RTC engine')

        engineRef.current = engine

        if (typeof engine.initialize === 'function') {
          engine.initialize({ appId })
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
            onUserJoined: (_connection: any, uid: number) => {
              console.log('[StaffVoiceCall:Native] Remote user joined:', uid)
            },
            onUserOffline: (_connection: any, uid: number) => {
              console.log('[StaffVoiceCall:Native] Remote user left:', uid)
              setIsConnected(false)
              onCallEnded?.()
            },
          })
        } else if (typeof engine.addListener === 'function') {
          engine.addListener('UserJoined', (uid: number) => {
            console.log('[StaffVoiceCall:Native] Remote user joined:', uid)
          })
          engine.addListener('UserOffline', (uid: number) => {
            console.log('[StaffVoiceCall:Native] Remote user left:', uid)
            setIsConnected(false)
            onCallEnded?.()
          })
        }

        // Staff always joins as UID=2
        if (typeof engine.joinChannel === 'function') {
          engine.joinChannel(token ?? '', channel, 2, {
            clientRoleType: (agoraMod as any).ClientRoleType?.ClientRoleBroadcaster ?? 1,
            channelProfile: (agoraMod as any).ChannelProfileType?.ChannelProfileCommunication ?? 0,
          })
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
    callDurationSeconds,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleSpeaker,
  }
}
