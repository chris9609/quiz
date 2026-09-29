import Link from "next/link";
import { QUESTIONS_PER_GAME } from "@/lib/quizData";
import ResultList from "./ResultList";

type Props = {
  searchParams: Promise<{ correct?: string; total?: string }>;
};

/** 点数やランクは出さず、正解数と「今回の問題」の振り返りだけを見せる（学習用ツールとしての割り切り） */
export default async function ResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const correct = parseInt(params.correct ?? "0", 10);
  const total = parseInt(params.total ?? String(QUESTIONS_PER_GAME), 10);

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-indigo-900">🏁 結果</h1>
          <p className="text-indigo-600">お疲れ様でした！</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-gray-500 text-sm font-medium mb-1">正解数</p>
          <p className="text-5xl font-black text-indigo-700">
            {correct} <span className="text-2xl font-bold text-gray-400">/ {total} 問</span>
          </p>
        </div>

        <ResultList />

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/quiz"
            className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg px-8 py-4 rounded-full shadow-lg transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5"
          >
            もう一度挑戦！
          </Link>
          <Link
            href="/"
            className="block text-center bg-white hover:bg-gray-50 text-indigo-700 font-medium text-base px-8 py-3 rounded-full border border-indigo-200 shadow transition-colors"
          >
            トップへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
