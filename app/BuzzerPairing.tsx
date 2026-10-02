"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBuzzerRoom } from "@/lib/useBuzzerRoom";

/**
 * トップページで、ゲームを始める前にスマホを早押しボタンとしてつないでおく。
 * このページはログインした人にしか見えず、部屋はブラウザごとに別なので、
 * QR を他の利用者に見られることはない。
 */
export default function BuzzerPairing() {
  const { url, phoneCount, newRoom } = useBuzzerRoom();
  const [open, setOpen] = useState(false);

  if (!url) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-700 text-lg">📱 スマホを早押しボタンに</h2>
        {phoneCount > 0 ? (
          <span className="text-sm font-medium text-green-600">● つながりました</span>
        ) : (
          <span className="text-sm text-gray-400">○ 未接続</span>
        )}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-indigo-500 hover:text-indigo-700 underline"
      >
        {open ? "QR コードを閉じる ▲" : "QR コードを表示 ▼"}
      </button>

      {open && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">スマホのカメラで読み取ってください（ログイン不要）</p>
          <QRCodeSVG value={url} size={180} />
          <a href={url} target="_blank" className="max-w-[260px] break-all text-xs text-gray-400 underline">
            {url}
          </a>
          <button onClick={newRoom} className="text-xs text-gray-500 hover:text-gray-700 underline">
            新しい部屋を作る（前の QR は使えなくなります）
          </button>
        </div>
      )}
    </div>
  );
}
