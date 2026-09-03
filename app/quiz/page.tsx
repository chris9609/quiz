import Link from "next/link";
import QuizClient from "./QuizClient";
import { getQuizzes } from "@/lib/quizData";

// 出題は毎回ランダムなので、ビルド時に固定させない
export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const quizzes = await getQuizzes();

  // DB が空（seed 未投入 / 一時停止からの復帰直後）でもクラッシュさせない
  if (quizzes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <p className="text-4xl">🗂️</p>
          <h1 className="text-xl font-bold text-gray-800">問題がありません</h1>
          <p className="text-gray-600 text-sm">
            データベースに問題が登録されていません。
            <code className="mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
              supabase/seed.sql
            </code>
            を実行してください。
          </p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-full transition-colors"
          >
            トップへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return <QuizClient quizzes={quizzes} />;
}
