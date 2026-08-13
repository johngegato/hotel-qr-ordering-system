import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@hotel-qr/supabase/types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createSupabaseBrowserClient() {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.warn(
        'Missing Supabase environment variables! Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured in apps/web/.env.local.'
      )
    }
  }

  client = createBrowserClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
  )

  return client
}
