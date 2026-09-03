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

        if (isMounted) setIsConnected(true)
      } catch (err: any) {
        console.error('[GuestVoiceCall] Join error:', err)
        if (isMounted) setError(err?.message ?? 'Failed to join voice call')
      }
    }

    join()

    return () => {
      isMounted = false
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
