import { createBrowserClient } from '@supabase/ssr'

/** ブラウザ（Client Component）用の Supabase クライアント */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // 早押しは切れたことに早く気づきたい。標準の25秒間隔だと、回線が変わったときなどに
      // 約47秒間、押しても届かないまま気づけなかった（実測）
      realtime: { heartbeatIntervalMs: 5000 },
    }
  )
}
