import { NextRequest, NextResponse } from 'next/server'
import { sendWebPushToHotelStaff, WebPushPayload } from '@/lib/webPush'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { hotelId, title, body: contentBody, requestId, roomNumber, requestType, url } = body

    const targetHotelId = hotelId || '00000000-0000-0000-0000-000000000001'

    const payload: WebPushPayload = {
      title: title || `🚨 New ${requestType ? requestType.replace(/_/g, ' ') : 'Guest Request'}`,
      body: contentBody || (roomNumber ? `Room ${roomNumber} submitted a new request.` : 'A guest request requires staff attention.'),
      requestId,
      roomNumber,
      requestType,
      url: url || '/',
    }

    const result = await sendWebPushToHotelStaff(targetHotelId, payload)

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[API/push/send] Handler error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
