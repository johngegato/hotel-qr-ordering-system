'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseGuestVoiceCallOptions {
  appId: string
  channel: string
  token: string | null
}

interface GuestVoiceCallState {
  isConnected: boolean
  isMuted: boolean
  error: string | null
  toggleMute: () => void
  endCall: () => Promise<void>
}

/**
 * Browser-side Agora RTC hook for guest voice calling.
 * Guest always joins as UID=1.
 * Dynamically imports agora-rtc-sdk-ng to avoid SSR issues in Next.js.
 */
export function useGuestVoiceCall({
  appId,
  channel,
  token,
}: UseGuestVoiceCallOptions): GuestVoiceCallState {
  const clientRef = useRef<any>(null)
  const localTrackRef = useRef<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Join channel on mount
  useEffect(() => {
    if (!appId || !channel) return

    let isMounted = true

    let connectionStateHandler: ((curState: string, prevState: string) => void) | undefined

    const join = async () => {
      try {
        // Dynamic import — avoids SSR errors since Agora requires browser APIs
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
        AgoraRTC.setLogLevel(4) // Error-only logging in production

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        clientRef.current = client

        // Guest is always UID=1
        await client.join(appId, channel, token ?? null, 1)

        // Create and publish microphone track
        const micTrack = await AgoraRTC.createMicrophoneAudioTrack()
        localTrackRef.current = micTrack
        await client.publish([micTrack])


        // Auto-play remote audio streams (staff speaking)
        client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
          await client.subscribe(user, mediaType)
          if (mediaType === 'audio') {
            user.audioTrack?.play()
          }
        })

        client.on('user-unpublished', (user: any, mediaType: string) => {
          if (mediaType === 'audio') {
            user.audioTrack?.stop()
          }
        })

        // --- Connection state observer + auto-reconnect (exponential backoff) ---
        let reconnectAttempts = 0
        const maxReconnectAttempts = 3

        const attemptReconnect = async () => {
          try {
            if (!clientRef.current) return
            if (reconnectAttempts >= maxReconnectAttempts) {
              console.warn('[GuestVoiceCall] Max reconnect attempts reached')
              return
            }
            reconnectAttempts += 1
            const delay = Math.pow(2, reconnectAttempts) * 1000
            console.log(`[GuestVoiceCall] Reconnect attempt ${reconnectAttempts}, waiting ${delay}ms`)
            await new Promise((r) => setTimeout(r, delay))
            // Try graceful leave then re-join
            try { await clientRef.current.leave() } catch { /* ignore */ }
            await clientRef.current.join(appId, channel, token ?? null, 1)
            // Re-publish mic track if available
            if (localTrackRef.current) {
              try { await clientRef.current.publish([localTrackRef.current]) } catch { /* ignore */ }
            }
            reconnectAttempts = 0
            setIsConnected(true)
            console.log('[GuestVoiceCall] Rejoined channel successfully')
          } catch (err) {
            console.warn('[GuestVoiceCall] Reconnect failed:', err)
            if (reconnectAttempts < maxReconnectAttempts) attemptReconnect()
          }
        }

        connectionStateHandler = (curState: string, prevState: string) => {
          console.log('[GuestVoiceCall] connection-state-change', prevState, '->', curState)
          if (curState === 'DISCONNECTED' || curState === 'FAILED') {
            setIsConnected(false)
            attemptReconnect().catch(() => {})
          }
        }

        if (typeof client.on === 'function' && connectionStateHandler) {
          client.on('connection-state-change', connectionStateHandler)
        }

        if (isMounted) setIsConnected(true)
      } catch (err: any) {
        console.error('[GuestVoiceCall] Join error:', err)
        if (isMounted) setError(err?.message ?? 'Failed to join voice call')
      }
    }

    join()

    return () => {
      isMounted = false
      try {
        if (clientRef.current && typeof clientRef.current.off === 'function' && connectionStateHandler) {
          clientRef.current.off('connection-state-change', connectionStateHandler)
        }
      } catch (e) {
        /* ignore */
      }
      // Cleanup local track and leave channel
      try {
        localTrackRef.current?.stop()
        localTrackRef.current?.close()
      } catch { /* ignore */ }
      try {
        clientRef.current?.leave().catch(() => {})
      } catch { /* ignore */ }
    }
  }, [appId, channel, token])

  const endCall = useCallback(async () => {
    try {
      localTrackRef.current?.stop()
      localTrackRef.current?.close()
      await clientRef.current?.leave()
    } catch (err) {
      console.warn('[GuestVoiceCall] Leave error:', err)
    } finally {
      setIsConnected(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    const track = localTrackRef.current
    if (!track) return
    const next = !isMuted
    track.setEnabled(!next)
    setIsMuted(next)
  }, [isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localTrackRef.current?.stop()
      localTrackRef.current?.close()
      clientRef.current?.leave().catch(() => {})
    }
  }, [])

  return { isConnected, isMuted, error, toggleMute, endCall }
}
