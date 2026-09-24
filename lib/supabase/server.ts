import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * サーバー側（Server Component / Route Handler / Server Function）用の Supabase クライアント。
 * ログイン中なら cookie の通行証を添えて DB に問い合わせるので、RLS で「ログイン済みのみ」にしても読める。
 * リクエストごとに作り直すこと（使い回すと別ユーザーの cookie が混ざる）。
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Component からは cookie を書けない。通行証の更新は proxy.ts が担当するので無視してよい
          }
        },
      },
    }
  )
}
