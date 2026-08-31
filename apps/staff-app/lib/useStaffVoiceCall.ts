import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

interface UseStaffVoiceCallOptions {
  onCallEnded?: () => void
}

interface StaffVoiceCallState {
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
 * Universal Agora voice call hook for staff-side (Mobile Android + Web Browser).
 * Staff always joins as UID=2.
 * - On Native (Android/iOS): Uses `react-native-agora` + `react-native-incall-manager`.
 * - On Web (Browser): Uses `agora-rtc-sdk-ng` for direct WebRTC microphone streaming.
 */
export function useStaffVoiceCall({ onCallEnded }: UseStaffVoiceCallOptions = {}): StaffVoiceCallState {
  const engineRef = useRef<any>(null)
  const webClientRef = useRef<any>(null)
  const webLocalTrackRef = useRef<any>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [callDurationSeconds, setCallDurationSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Call duration timer
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
      // ─────────────────────────────────────────────────────────────────────────────
      // WEB BROWSER IMPLEMENTATION (agora-rtc-sdk-ng)
      // ─────────────────────────────────────────────────────────────────────────────
      if (Platform.OS === 'web') {
        try {
          const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
          AgoraRTC.setLogLevel(4)

          const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
          webClientRef.current = client

          // Staff joins as UID=2
          await client.join(appId, channel, token ?? null, 2)

          // Capture and publish staff microphone
          const micTrack = await AgoraRTC.createMicrophoneAudioTrack()
          webLocalTrackRef.current = micTrack
          await client.publish([micTrack])

          // Play incoming audio from guest (UID 1)
          client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
            await client.subscribe(user, mediaType)
            if (mediaType === 'audio') {
              user.audioTrack?.play()
            }
          })

          client.on('user-unpublished', (user: any, mediaType: 'audio' | 'video') => {
            if (mediaType === 'audio') {
              user.audioTrack?.stop()
            }
          })

          client.on('user-left', () => {
            console.log('[StaffVoiceCall:Web] Guest left call')
            setIsConnected(false)
            onCallEnded?.()
          })

          setIsConnected(true)
          setIsMuted(false)
          setIsSpeakerOn(true)
          return
        } catch (err) {
          console.error('[StaffVoiceCall:Web] Join error:', err)
          throw err
        }
      }

      // ─────────────────────────────────────────────────────────────────────────────
      // NATIVE ANDROID / IOS IMPLEMENTATION (react-native-agora)
      // ─────────────────────────────────────────────────────────────────────────────
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

        // Register event handler for remote participant
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
    // Web cleanup
    if (Platform.OS === 'web') {
      try {
        webLocalTrackRef.current?.stop()
        webLocalTrackRef.current?.close()
        await webClientRef.current?.leave()
      } catch (err) {
        console.warn('[StaffVoiceCall:Web] Leave error:', err)
      } finally {
        setIsConnected(false)
        onCallEnded?.()
      }
      return
    }

    // Native cleanup
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
    if (Platform.OS === 'web') {
      const track = webLocalTrackRef.current
      if (track) {
        track.setEnabled(!next)
      }
    } else {
      if (engineRef.current && typeof engineRef.current.muteLocalAudioStream === 'function') {
        await engineRef.current.muteLocalAudioStream(next)
      }
    }
    setIsMuted(next)
  }, [isMuted])

  const toggleSpeaker = useCallback(async () => {
    const next = !isSpeakerOn
    if (Platform.OS !== 'web' && engineRef.current && typeof engineRef.current.setEnableSpeakerphone === 'function') {
      await engineRef.current.setEnableSpeakerphone(next)
    }
    setIsSpeakerOn(next)
  }, [isSpeakerOn])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (Platform.OS === 'web') {
        webLocalTrackRef.current?.stop()
        webLocalTrackRef.current?.close()
        webClientRef.current?.leave().catch(() => {})
      } else if (engineRef.current) {
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
