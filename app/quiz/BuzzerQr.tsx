"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/** スマホを早押しボタンにするための QR。普段は邪魔にならないよう畳んでおく */
export default function BuzzerQr({ url, onNewRoom }: { url: string; onNewRoom: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-indigo-500 hover:text-indigo-700 underline"
      >
        📱 スマホを早押しボタンにする {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mx-auto mt-3 flex w-fit flex-col items-center gap-3 bg-white rounded-2xl shadow p-4">
          <QRCodeSVG value={url} size={160} />
          <a href={url} target="_blank" className="max-w-[240px] break-all text-xs text-gray-400 underline">
            {url}
          </a>
          <button onClick={onNewRoom} className="text-xs text-gray-500 hover:text-gray-700 underline">
            新しい部屋を作る（前の QR は使えなくなります）
          </button>
        </div>
      )}
    </div>
  );
}
