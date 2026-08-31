import { NextRequest, NextResponse } from 'next/server'
import { sendWebPushToHotelStaff, WebPushPayload } from '@/lib/webPush'
import { createClient } from '@supabase/supabase-js'

/**
 * Automated Database Webhook Endpoint:
 * Triggered by Postgres database triggers or Supabase Database Webhooks on requests table INSERT.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()
    console.log('[API/push/webhook] Received webhook event:', JSON.stringify(rawBody).slice(0, 200))

    // Supabase webhook payload structure has `record` or `new`
    const record = rawBody.record || rawBody.new || rawBody
    if (!record || !record.id) {
      return NextResponse.json({ message: 'No valid request record found in payload' }, { status: 200 })
    }

    const eventType = (rawBody.type || rawBody.eventType || 'INSERT').toUpperCase()
    const status = String(record.status || '').toUpperCase()

    // Only dispatch push for new PENDING or PENDING_ON_CALL requests
    if (eventType !== 'INSERT' && status !== 'PENDING' && status !== 'PENDING_ON_CALL') {
      return NextResponse.json({ message: 'Ignored non-pending or non-insert event', status }, { status: 200 })
    }

    const hotelId = record.hotel_id || '00000000-0000-0000-0000-000000000001'
    const requestType = record.request_type || 'REQUEST'
    let roomNumber = record.payload?.room_number || record.room_number || ''

    // If room number not in payload, look up from rooms table
    if (!roomNumber && record.room_id) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsjnlawhdgfilcfejbji.supabase.co'
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const { data: roomData } = await supabase
          .from('rooms')
          .select('room_number')
          .eq('id', record.room_id)
          .maybeSingle()
        if (roomData?.room_number) {
          roomNumber = roomData.room_number
        }
      } catch {
        // ignore lookup error
      }
    }

    const formattedType = requestType.replace(/_/g, ' ')
    const title = `🚨 New ${formattedType}`
    const body = roomNumber
      ? `Room ${roomNumber} submitted a new ${formattedType.toLowerCase()}.`
      : `A new ${formattedType.toLowerCase()} requires immediate staff attention.`

    const payload: WebPushPayload = {
      title,
      body,
      requestId: record.id,
      roomNumber: roomNumber ? String(roomNumber) : undefined,
      requestType,
      url: '/',
    }

    const result = await sendWebPushToHotelStaff(hotelId, payload)

    return NextResponse.json({
      success: true,
      requestId: record.id,
      requestType,
      roomNumber,
      result,
    })
  } catch (err: any) {
    console.error('[API/push/webhook] Webhook processing error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
