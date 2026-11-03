"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useBuzzerRoom } from "@/lib/useBuzzerRoom";
import type { BuzzPayload } from "@/lib/buzzer";

/**
 * 司会画面。スマホが押した順に名前を並べ、「リセット」で次の問題へ。
 * スマホは押せるままなので、同じ人が何度押しても最初の1回だけを数える。
 * 順番は「この画面に届いた順」。電波の差で数十ミリ秒ずれることはある。
 */
export default function HostClient() {
  const [order, setOrder] = useState<BuzzPayload[]>([]);
  const [showQr, setShowQr] = useState(true);
  const { url, phoneNames, newRoom } = useBuzzerRoom((buzz) => {
    if (!buzz) return;
    setOrder((prev) => (prev.some((p) => p.id === buzz.id) ? prev : [...prev, buzz]));
  });

  const [first, ...rest] = order;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 to-blue-100">
      <header className="flex items-center justify-between px-4 pt-4">
        <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-800 underline">
          ← トップへ
        </Link>
        <button
          onClick={() => setShowQr((v) => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-800 underline"
        >
          {showQr ? "QR コードを隠す" : "QR コードを表示"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
        {showQr && url && (
          <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-lg sm:flex-row sm:items-start sm:gap-6">
            <QRCodeSVG value={url} size={180} className="shrink-0" />
            <div className="flex w-full flex-col gap-3">
              <p className="text-sm text-gray-500">スマホのカメラで読み取ると早押しボタンになります（ログイン不要）</p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">参加者 {phoneNames.length}人</p>
                {phoneNames.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {phoneNames.map((name, i) => (
                      <li key={i} className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                        ● {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">まだいません</p>
                )}
              </div>
              <button onClick={newRoom} className="self-start text-xs text-gray-500 hover:text-gray-700 underline">
                新しい部屋を作る（前の QR は使えなくなります）
              </button>
            </div>
          </section>
        )}

        <section className="flex flex-1 flex-col items-center gap-6 rounded-2xl bg-white p-6 shadow-lg">
          {first ? (
            <>
              <div className="text-center">
                <p className="text-lg font-bold text-red-500">1着</p>
                <p className="break-all text-5xl font-black text-indigo-900 sm:text-7xl">{first.name}</p>
              </div>
              {rest.length > 0 && (
                <ol className="w-full max-w-sm space-y-2">
                  {rest.map((p, i) => (
                    <li key={p.id} className="flex items-baseline gap-3 rounded-xl bg-gray-50 px-4 py-2">
                      <span className="w-10 shrink-0 text-sm font-bold text-gray-500">{i + 2}着</span>
                      <span className="break-all text-xl font-bold text-gray-800">{p.name}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="my-auto text-center text-xl text-gray-400">押されるのを待っています…</p>
          )}

          <button
            onClick={() => setOrder([])}
            className="mt-auto rounded-full bg-indigo-600 px-12 py-4 text-xl font-bold text-white shadow-lg hover:bg-indigo-700 active:bg-indigo-800"
          >
            リセット（次の問題へ）
          </button>
        </section>
      </main>
    </div>
  );
}
