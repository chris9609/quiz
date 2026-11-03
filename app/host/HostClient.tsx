"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useBuzzerRoom } from "@/lib/useBuzzerRoom";
import type { BuzzPayload } from "@/lib/buzzer";

/**
 * 司会画面。問題は司会が声で出し、この画面は2段階で使う。
 *   受付（waiting）: QR を大きく出して参加者を集める。押されても数えない
 *   本番（playing）: 押した順に名前を並べ、「次の問題へ」で消して次の問題へ
 * スマホは押せるままなので、同じ人が何度押しても最初の1回だけを数える。
 * 順番は「この画面に届いた順」。電波の差で数十ミリ秒ずれることはある。
 */
export default function HostClient() {
  const [phase, setPhase] = useState<"waiting" | "playing">("waiting");
  const [questionNo, setQuestionNo] = useState(1);
  const [order, setOrder] = useState<BuzzPayload[]>([]);
  const [showQr, setShowQr] = useState(false);

  // 合図を受け取る関数の中では、最新の phase を ref で見る
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });

  const { url, phoneNames, newRoom, sendRanking } = useBuzzerRoom((buzz) => {
    if (!buzz || phaseRef.current !== "playing") return;
    setOrder((prev) => (prev.some((p) => p.id === buzz.id) ? prev : [...prev, buzz]));
  });

  // 押した順が変わるたびに全員のスマホへ送る（1着・2着のランプ用）。受付中や次の問題では空にして消す
  useEffect(() => {
    sendRanking(phase === "playing" ? order.map((p) => p.id) : []);
  }, [order, phase, sendRanking]);

  // 今の問題で司会が付けた判定（付けた順。「1つ戻す」で後ろから消す）
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  // 前の問題までの得点。名前で数える（スマホを読み込み直すと id は変わるが、名前は同じなので）
  const [scores, setScores] = useState<Record<string, number>>({});

  const resultOf = new Map(judgments.map((j) => [j.id, j.result]));
  const winner = order.find((p) => resultOf.get(p.id) === "correct");
  // 回答権は、まだ判定していない人のうち一番早く押した人。正解が出たらその問題はおしまい
  const answerer = winner ? undefined : order.find((p) => !resultOf.has(p.id));

  // 得点表は今の問題の正解も足して出す
  const totals = { ...scores };
  if (winner) totals[winner.name] = (totals[winner.name] ?? 0) + 1;
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const judge = (result: Judgment["result"]) => {
    if (answerer) setJudgments((prev) => [...prev, { id: answerer.id, result }]);
  };

  const start = () => {
    setOrder([]);
    setJudgments([]);
    setScores({});
    setQuestionNo(1);
    setShowQr(false);
    setPhase("playing");
  };

  const next = () => {
    setScores(totals);
    setOrder([]);
    setJudgments([]);
    setQuestionNo((n) => n + 1);
  };

  if (phase === "waiting") {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 to-blue-100">
        <header className="px-4 pt-4">
          <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-800 underline">
            ← トップへ
          </Link>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
          <section className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-lg">
            <h1 className="text-2xl font-bold text-indigo-900">参加者を集めています</h1>
            <p className="text-sm text-gray-500">スマホのカメラで読み取ると早押しボタンになります（ログイン不要）</p>
            {url && (
              <>
                <QRCodeSVG value={url} size={220} />
                <div className="w-full max-w-md">
                  <CopyUrl url={url} />
                </div>
              </>
            )}
            <ParticipantList names={phoneNames} />
            <button onClick={newRoom} className="text-xs text-gray-500 hover:text-gray-700 underline">
              新しい部屋を作る（前の QR は使えなくなります）
            </button>
          </section>

          <div className="text-center">
            <button
              onClick={start}
              disabled={phoneNames.length === 0}
              className="rounded-full bg-indigo-600 px-16 py-4 text-2xl font-bold text-white shadow-lg hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            >
              スタート！
            </button>
            {phoneNames.length === 0 && <p className="mt-2 text-xs text-gray-400">参加者が入ると押せます</p>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 to-blue-100">
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <button
          onClick={() => setPhase("waiting")}
          className="text-sm text-indigo-600 hover:text-indigo-800 underline"
        >
          ← 受付に戻る
        </button>
        <button
          onClick={() => setShowQr((v) => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-800 underline"
        >
          {showQr ? "QR コードを隠す" : `QR を表示（参加者 ${phoneNames.length}人）`}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
        {/* 遅れて来た人を入れるとき用 */}
        {showQr && url && (
          <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-lg sm:flex-row sm:items-start sm:gap-6">
            <QRCodeSVG value={url} size={160} className="shrink-0" />
            <div className="flex w-full flex-col gap-3">
              <CopyUrl url={url} />
              <ParticipantList names={phoneNames} />
            </div>
          </section>
        )}

        <section className="flex flex-col items-center gap-5 rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-lg font-bold text-indigo-500">第{questionNo}問</p>

          {/* いま誰の番か・結果を大きく出す */}
          {winner ? (
            <div className="text-center">
              <p className="text-lg font-bold text-red-500">⭕ 正解！</p>
              <p className="break-all text-5xl font-black text-indigo-900 sm:text-7xl">{winner.name}</p>
            </div>
          ) : answerer ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-red-500">{order.indexOf(answerer) + 1}着・回答権</p>
                <p className="break-all text-5xl font-black text-indigo-900 sm:text-7xl">{answerer.name}</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => judge("correct")}
                  aria-label="正解"
                  className="rounded-2xl bg-red-500 px-10 py-4 text-4xl shadow-lg active:bg-red-700"
                >
                  ⭕
                </button>
                <button
                  onClick={() => judge("wrong")}
                  aria-label="不正解"
                  className="rounded-2xl bg-blue-500 px-10 py-4 text-4xl shadow-lg active:bg-blue-700"
                >
                  ❌
                </button>
              </div>
            </div>
          ) : order.length > 0 ? (
            <p className="py-6 text-center text-xl text-gray-500">押した人は全員 ❌ でした</p>
          ) : (
            <p className="py-6 text-center text-xl text-gray-400">押されるのを待っています…</p>
          )}

          {order.length > 0 && (
            <ol className="w-full max-w-sm space-y-2">
              {order.map((p, i) => {
                const result = resultOf.get(p.id);
                return (
                  <li
                    key={p.id}
                    className={`flex items-baseline gap-3 rounded-xl px-4 py-2 ${
                      p === answerer ? "bg-yellow-50 ring-2 ring-yellow-300" : "bg-gray-50"
                    }`}
                  >
                    <span className="w-10 shrink-0 text-sm font-bold text-gray-500">{i + 1}着</span>
                    <span
                      className={`min-w-0 flex-1 break-all text-xl font-bold ${
                        result === "wrong" ? "text-gray-400 line-through" : "text-gray-800"
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="text-xl">{result === "correct" ? "⭕" : result === "wrong" ? "❌" : ""}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {judgments.length > 0 && (
            <button
              onClick={() => setJudgments((prev) => prev.slice(0, -1))}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              ↶ 1つ戻す
            </button>
          )}
        </section>

        {ranking.length > 0 && (
          <section className="rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-3 text-sm font-bold text-gray-500">得点</h2>
            <ol className="space-y-1">
              {ranking.map(([name, score]) => (
                <li key={name} className="flex items-baseline justify-between gap-3">
                  <span className="break-all font-bold text-gray-800">{name}</span>
                  <span className="shrink-0 font-bold text-indigo-600">{score}点</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      {/* 押した人が多くても隠れないよう、画面の下に固定する */}
      <div className="sticky bottom-0 border-t border-indigo-100 bg-white/90 p-4 text-center backdrop-blur">
        <button
          onClick={next}
          className="rounded-full bg-indigo-600 px-12 py-4 text-xl font-bold text-white shadow-lg hover:bg-indigo-700 active:bg-indigo-800"
        >
          次の問題へ
        </button>
      </div>
    </div>
  );
}

type Judgment = { id: string; result: "correct" | "wrong" };

function ParticipantList({ names }: { names: string[] }) {
  return (
    <div className="w-full space-y-2 text-left">
      <p className="text-xs font-medium text-gray-500">参加者 {names.length}人</p>
      {names.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {names.map((name, i) => (
            <li key={i} className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              ● {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">まだいません</p>
      )}
    </div>
  );
}

/**
 * QR の URL を文字でも出し、コピーできるようにする。
 * QR を読めない人に LINE で送ったり、ダミー参加者（scripts/fake_buzzers.mjs）に渡したりするため。
 * コピーが使えない環境（http の LAN アドレスなど）でも、文字は長押しで選べる。
 */
function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {}
  };

  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 select-all break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
        {url}
      </p>
      <button
        onClick={copy}
        className="shrink-0 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </div>
  );
}
