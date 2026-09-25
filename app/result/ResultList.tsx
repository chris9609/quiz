"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { type QuizResult, QUIZ_RESULTS_STORAGE_KEY } from "@/lib/quizResults";
import { createClient } from "@/lib/supabase/client";

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

/**
 * Anki ボタンの状態。アプリは anki_requests に「入れたい」と記録するだけで、
 * 実際の投入は Mac 上の scripts/export_anki.py が AnkiConnect 経由で行う
 * （デプロイ先からは localhost の AnkiConnect に届かないため）。
 */
type AnkiStatus = "idle" | "saving" | "requested" | "error";

// 同じ問題を2回押した（別のプレイで既に記録済み含む）ときの unique 制約違反
const UNIQUE_VIOLATION = "23505";

function AnkiButton({ status, onClick }: { status: AnkiStatus; onClick: () => void }) {
  if (status === "requested") {
    return <span className="text-sm font-medium text-green-700">✓ Anki 追加済み</span>;
  }
  return (
    <button
      onClick={onClick}
      disabled={status === "saving"}
      className="text-sm font-medium px-3 py-1 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
    >
      {status === "saving" ? "記録中…" : status === "error" ? "失敗しました（再試行）" : "+ Anki"}
    </button>
  );
}

/** 今回解いた問題の一覧。どこまで読んで押したかが分かるよう、未表示だった部分は薄く出す */
export default function ResultList() {
  // サーバーでは sessionStorage が読めないので null → クライアントで中身に置き換わる
  const raw = useSyncExternalStore(subscribe, readStoredResults, () => null);
  const results = parseResults(raw);
  const [ankiStatus, setAnkiStatus] = useState<Record<string, AnkiStatus>>({});

  // 前のプレイで既に押した問題は最初から「追加済み」にする。
  // results は毎回作り直される配列なので、依存には中身の ID を連結した文字列を使う
  const quizIdsKey = results.flatMap((r) => (r.quizId ? [r.quizId] : [])).join(",");
  useEffect(() => {
    if (!quizIdsKey) return;
    const supabase = createClient();
    supabase
      .from("anki_requests")
      .select("quiz_id")
      .in("quiz_id", quizIdsKey.split(","))
      .then(({ data }) => {
        // 読めなくても（テーブル未作成など）ボタンが押せるだけなので黙って無視する
        if (!data) return;
        setAnkiStatus((prev) => ({
          ...prev,
          ...Object.fromEntries(data.map((row) => [row.quiz_id, "requested" as const])),
        }));
      });
  }, [quizIdsKey]);

  const requestAnki = async (quizId: string) => {
    setAnkiStatus((prev) => ({ ...prev, [quizId]: "saving" }));
    const supabase = createClient();
    const { error } = await supabase.from("anki_requests").insert({ quiz_id: quizId });
    const ok = !error || error.code === UNIQUE_VIOLATION;
    setAnkiStatus((prev) => ({ ...prev, [quizId]: ok ? "requested" : "error" }));
  };

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
            {r.quizId && (
              <div className="flex justify-end">
                <AnkiButton
                  status={ankiStatus[r.quizId] ?? "idle"}
                  onClick={() => requestAnki(r.quizId!)}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-gray-400">薄い文字は、押した時点でまだ表示されていなかった部分です</p>
    </div>
  );
}
