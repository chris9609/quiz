import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import BuzzerPairing from "./BuzzerPairing";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      <form action={signOut} className="absolute top-4 right-4 flex items-center gap-3 text-sm">
        {email && <span className="text-indigo-700">{email}</span>}
        <button
          type="submit"
          className="bg-white hover:bg-gray-50 text-indigo-700 px-4 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-colors"
        >
          ログアウト
        </button>
      </form>

      <div className="w-full max-w-3xl space-y-8 p-4 sm:p-8">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-indigo-900">⚡ 早押しクイズ</h1>
          <p className="text-lg text-indigo-600">問題文が1文字ずつ表示される早押しクイズ</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-4 text-left">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-indigo-900">⌨️ ひとりで</h2>
              <p className="text-sm text-gray-500">
                わかった瞬間に{" "}
                <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd>{" "}
                で早押し
              </p>
            </div>
            <div className="mt-auto pt-2 text-center">
              <Link
                href="/quiz"
                className="inline-block bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5"
              >
                スタート！
              </Link>
            </div>
          </div>

          <BuzzerPairing />
        </div>

        <div className="text-center text-sm text-indigo-700/80 space-y-1">
          <p>📖 問題文が1文字ずつ表示されます → 🔔 わかったら早押し → ✍️ 回答を入力して送信</p>
        </div>
      </div>
    </div>
  );
}
