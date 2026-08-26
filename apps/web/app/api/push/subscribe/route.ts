import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, staffUserId, hotelId } = body

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
    }

    const defaultHotelId = hotelId || '00000000-0000-0000-0000-000000000001'
    const userAgent = req.headers.get('user-agent') || 'PWA'

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsjnlawhdgfilcfejbji.supabase.co'
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Upsert subscription into staff_push_subscriptions
    const { data, error } = await supabase
      .from('staff_push_subscriptions')
      .upsert(
        {
          hotel_id: defaultHotelId,
          staff_user_id: staffUserId || null,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('id')
      .single()

    if (error) {
      console.error('[API/push/subscribe] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err: any) {
    console.error('[API/push/subscribe] Handler error:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
