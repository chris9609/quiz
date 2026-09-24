import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * マジックリンクの着地点。リンクの形は2通りあり、どちらも受け付ける。
 *
 *   ?code=...                       Supabase 標準テンプレート（PKCE 方式）
 *   ?token_hash=...&type=email      自前テンプレート（{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email）
 *
 * PKCE はリンクを要求したのと同じブラウザでしか開けず、スマホの Gmail アプリ内ブラウザ等で失敗する。
 * テンプレート編集には Custom SMTP が必要なので、今は標準テンプレート（PKCE）で動かしている。
 * スマホで使う前に SMTP を設定して token_hash 方式に切り替えること。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()
  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error
  }

  return NextResponse.redirect(new URL(ok ? '/' : '/login?error=link', request.url))
}
