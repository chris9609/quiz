import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import BuzzerPairing from "./BuzzerPairing";
import { QUESTION_COUNT_OPTIONS, parseQuestionCount } from "@/lib/quizData";

type Props = {
  searchParams: Promise<{ n?: string | string[] }>;
};

export default async function Home({ searchParams }: Props) {
  // 選んだ出題数は URL（/?n=20）に持たせる。両方のカードのスタートに同じ数を渡せるうえ、リロードしても消えない
  const count = parseQuestionCount((await searchParams).n);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      {/* スマホでは見出しと重ならないよう通常の流れに置き、sm 以上で右上に浮かせる */}
      <form
        action={signOut}
        className="w-full flex justify-end items-center gap-3 text-sm px-4 pt-4 sm:absolute sm:top-4 sm:right-4 sm:w-auto sm:p-0"
      >
        {email && <span className="text-indigo-700 truncate min-w-0">{email}</span>}
        <button
          type="submit"
          className="shrink-0 bg-white hover:bg-gray-50 text-indigo-700 px-4 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-colors"
        >
          ログアウト
        </button>
      </form>

      <div className="w-full max-w-3xl space-y-8 p-4 sm:p-8">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-indigo-900">⚡ 早押しクイズ</h1>
          <p className="text-lg text-indigo-600">問題文が1文字ずつ表示される早押しクイズ</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-medium text-indigo-700">出題数</span>
          {QUESTION_COUNT_OPTIONS.map((option) => (
            <Link
              key={option}
              href={`/?n=${option}`}
              replace
              scroll={false}
              aria-current={option === count ? "true" : undefined}
              className={
                option === count
                  ? "rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white shadow"
                  : "rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50"
              }
            >
              {option}問
            </Link>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-4 text-left">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-indigo-900">⌨️ ひとりで</h2>
              <p className="text-sm text-gray-500">わかった瞬間に早押し</p>
            </div>
            <div className="mt-auto pt-2 text-center">
              <Link
                href={`/quiz?n=${count}`}
                className="inline-block bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5"
              >
                ひとりでスタート！
              </Link>
              {/* みんなでカードのボタン下の注意書きと同じ高さを空け、2つのボタンの位置をそろえる */}
              <p aria-hidden="true" className="mt-2 text-xs invisible">&nbsp;</p>
            </div>
          </div>

          <BuzzerPairing count={count} />
        </div>

        <div className="text-center text-sm text-indigo-700/80 space-y-1">
          <p>📖 問題文が1文字ずつ表示されます → 🔔 わかったら早押し → ✍️ 回答を入力して送信</p>
        </div>
      </div>
    </div>
  );
}
