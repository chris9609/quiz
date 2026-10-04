"use client";

import { useEffect, useState } from "react";
import { BUZZER_NAME_MAX } from "@/lib/buzzer";
import BuzzerClient from "./BuzzerClient";

const NAME_STORAGE_KEY = "buzzerName";

/**
 * ボタンを出す前に名前を聞く。PC 側に「誰がつながったか」を出すため。
 * 次に QR を読んだときに打ち直さなくて済むよう、名前はスマホに覚えておく。
 */
export default function BuzzerEntry({ room }: { room: string }) {
  const [draft, setDraft] = useState("");
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage はブラウザでしか読めない
      setDraft(localStorage.getItem(NAME_STORAGE_KEY) ?? "");
    } catch {}
  }, []);

  if (name) return <BuzzerClient room={room} name={name} />;

  const trimmed = draft.trim();
  const enter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    try {
      localStorage.setItem(NAME_STORAGE_KEY, trimmed);
    } catch {}
    setName(trimmed);
  };

  return (
    <form
      onSubmit={enter}
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-900 p-6"
    >
      <label htmlFor="buzzer-name" className="text-lg font-bold text-gray-200">
        名前
      </label>
      <input
        id="buzzer-name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={BUZZER_NAME_MAX}
        autoComplete="nickname"
        className="w-64 rounded-xl bg-gray-800 px-4 py-3 text-center text-2xl text-white outline-none focus:ring-2 focus:ring-red-500"
      />
      <button
        type="submit"
        disabled={!trimmed}
        className="w-64 rounded-full bg-red-500 py-4 text-xl font-bold text-white disabled:bg-gray-600"
      >
        入る
      </button>
    </form>
  );
}
