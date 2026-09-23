"use client";

import { useSyncExternalStore } from "react";
import { type QuizResult, QUIZ_RESULTS_STORAGE_KEY } from "@/lib/quizResults";

// sessionStorage はこのタブ内でしか変わらないので購読するものは無い
const subscribe = () => () => {};

function readStoredResults(): string | null {
  try {
    return sessionStorage.getItem(QUIZ_RESULTS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseResults(raw: string | null): QuizResult[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 今回解いた問題の一覧。どこまで読んで押したかが分かるよう、未表示だった部分は薄く出す */
export default function ResultList() {
  // サーバーでは sessionStorage が読めないので null → クライアントで中身に置き換わる
  const raw = useSyncExternalStore(subscribe, readStoredResults, () => null);
  const results = parseResults(raw);

  if (results.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <h2 className="text-lg font-bold text-indigo-900">今回の問題</h2>
      <ol className="space-y-4">
        {results.map((r, i) => (
          <li key={i} className="border-b border-gray-100 last:border-b-0 pb-4 last:pb-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">
                {r.correct ? "⭕" : "❌"} 第{i + 1}問
              </span>
              <span className={`text-sm font-bold ${r.correct ? "text-green-700" : "text-gray-400"}`}>
                {r.correct ? `+${r.score} 点` : "0 点"}
              </span>
            </div>
            <p className="text-gray-800 leading-relaxed">
              {r.question.slice(0, r.charsShown)}
              <span className="text-gray-400">{r.question.slice(r.charsShown)}</span>
            </p>
            <p className="text-sm text-gray-600">
              正解: <span className="font-bold text-gray-800">{r.answer}</span>
              {!r.correct && (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  あなたの回答: <span className="font-bold text-red-600">{r.userAnswer}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-gray-400">薄い文字は、押した時点でまだ表示されていなかった部分です</p>
    </div>
  );
}
