"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useBuzzerRoom } from "@/lib/useBuzzerRoom";

/**
 * トップページの「スマホをボタンにして」カード。ゲームを始める前にスマホをつないでおく。
 * つながる前に始めると押しても反応せず戸惑うので、つながるまでスタートは押せない。
 * このページはログインした人にしか見えず、部屋はブラウザごとに別なので、
 * QR を他の利用者に見られることはない。
 */
export default function BuzzerPairing() {
  const { url, phoneNames, newRoom } = useBuzzerRoom();
  const [open, setOpen] = useState(false);
  const connected = phoneNames.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-4 text-left">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-indigo-900">📱 スマホをボタンにして</h2>
        <p className="text-sm text-gray-500">スマホの画面全体が早押しボタンになります</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500">参加者</p>
        {connected ? (
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

      {url && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="self-start text-sm text-indigo-500 hover:text-indigo-700 underline"
        >
          {open ? "QR コードを閉じる ▲" : connected ? "QR コードを表示 ▼" : "スマホをつなぐ ▼"}
        </button>
      )}

      {url && open && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">スマホのカメラで読み取ってください（ログイン不要）</p>
          <QRCodeSVG value={url} size={180} />
          <button onClick={newRoom} className="text-xs text-gray-500 hover:text-gray-700 underline">
            新しい部屋を作る（前の QR は使えなくなります）
          </button>
        </div>
      )}

      <div className="mt-auto pt-2 text-center">
        {connected ? (
          <Link
            href="/quiz"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5"
          >
            スタート！
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-block bg-gray-200 text-gray-400 font-bold text-xl px-12 py-4 rounded-full cursor-not-allowed"
          >
            スタート！
          </span>
        )}
        {!connected && <p className="mt-2 text-xs text-gray-400">スマホがつながると押せます</p>}
      </div>
    </div>
  );
}
