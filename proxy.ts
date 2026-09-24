import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** ログインしていなくても開けるパス（ログイン画面と、マジックリンクの着地点） */
const PUBLIC_PATHS = ['/login', '/auth']

/**
 * 全ページの手前で動き、
 *   1. 期限の近い通行証（cookie）を更新する
 *   2. 未ログインなら /login へ飛ばす
 * ここは「入口の見張り」にすぎない。DB を守るのは RLS の役目。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )

  // getSession() は cookie を鵜呑みにするので使わない。getClaims() は署名を検証する
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = Boolean(data?.claims)
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!isLoggedIn && !isPublic) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    // 更新済みの通行証を捨てないよう、cookie を移し替える
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
