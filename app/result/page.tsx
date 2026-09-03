import Link from "next/link";
import { MAX_SCORE_PER_QUESTION, QUESTIONS_PER_GAME } from "@/lib/score";

type Props = {
  searchParams: Promise<{ score?: string; correct?: string; total?: string }>;
};

/**
 * ランクは「スコア達成率」と「正解率」の両方で決める。
 * スコアには正解の基礎点が含まれるので達成率だけ見ると、
 * 半分しか当たっていないプレイと全問正解（ただし遅い）が同じ帯に来てしまう。
 */
function determineRank(scoreRate: number, accuracy: number) {
  if (scoreRate >= 70 && accuracy >= 90) return { rank: "S", color: "text-yellow-500" };
  if (scoreRate >= 50 && accuracy >= 70) return { rank: "A", color: "text-indigo-600" };
  if (scoreRate >= 30 && accuracy >= 50) return { rank: "B", color: "text-green-600" };
  if (accuracy >= 30) return { rank: "C", color: "text-gray-500" };
  return { rank: "D", color: "text-gray-400" };
}

export default async function ResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const score = parseInt(params.score ?? "0", 10);
  const correct = parseInt(params.correct ?? "0", 10);
  const total = parseInt(params.total ?? String(QUESTIONS_PER_GAME), 10);

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const maxScore = total * MAX_SCORE_PER_QUESTION;
  const scoreRate = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const { rank, color: rankColor } = determineRank(scoreRate, accuracy);

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-indigo-900">🏁 結果発表</h1>
          <p className="text-indigo-600">お疲れ様でした！</p>
        </div>

        {/* Rank */}
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-gray-500 text-sm font-medium mb-1">ランク</p>
          <p className={`text-8xl font-black ${rankColor}`}>{rank}</p>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">合計スコア</span>
            <span className="text-2xl font-bold text-indigo-700">{score.toLocaleString()} 点</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">正解数</span>
            <span className="text-xl font-bold text-gray-800">
              {correct} / {total} 問
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">正解率</span>
            <span className="text-xl font-bold text-gray-800">{accuracy}%</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600">スコア達成率</span>
            <span className="text-xl font-bold text-gray-800">{scoreRate}%</span>
          </div>
        </div>

        {/* Score bar */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>0</span>
            <span>{maxScore.toLocaleString()} 点満点</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4">
            <div
              className="bg-indigo-500 h-4 rounded-full transition-all duration-700"
              style={{ width: `${scoreRate}%` }}
            />
          </div>
        </div>

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
