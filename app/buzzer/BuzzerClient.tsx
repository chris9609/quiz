"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BUZZ_EVENT, RANKING_EVENT, buzzerChannelName, hasHost, parseRanking, randomId, type BuzzPayload } from "@/lib/buzzer";

type Status = "connecting" | "ready" | "error";

export default function BuzzerClient({ room, name }: { room: string; name: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [hostOnline, setHostOnline] = useState(false);
  const [pressed, setPressed] = useState(false);
  // 自分が何着か（0 = まだ押していない / 順番が消えた）。司会画面から届く順番で決まる
  const [rank, setRank] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // このスマホの印。司会画面で同じ名前の人を見分けるのに使う
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    idRef.current ??= randomId();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(buzzerChannelName(room));
    channel
      .on("presence", { event: "sync" }, () => setHostOnline(hasHost(channel)))
      .on("broadcast", { event: RANKING_EVENT }, ({ payload }) => {
        const ids = parseRanking(payload);
        setRank(idRef.current ? ids.indexOf(idRef.current) + 1 : 0);
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("ready");
          // 司会画面に「誰のスマホがつながったか」を見せるために名乗る
          channel.track({ role: "buzzer", name });
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [room, name]);

  // onClick は指を離したときに発火するので遅い。触れた瞬間に送る
  const buzz = () => {
    if (status !== "ready" || !channelRef.current || !idRef.current) return;
    const payload: BuzzPayload = { id: idRef.current, name };
    channelRef.current.send({ type: "broadcast", event: BUZZ_EVENT, payload });
    setPressed(true);
    setTimeout(() => setPressed(false), 300);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-900 p-6 select-none">
      <p className="text-sm text-gray-400">
        {status === "connecting"
          ? "接続中…"
          : status === "error"
            ? "接続できませんでした。再読み込みしてください"
            : hostOnline
              ? "● 司会とつながっています"
              : "司会の準備を待っています…"}
      </p>

      <Lamp rank={rank} />

      <button
        onPointerDown={buzz}
        disabled={status !== "ready"}
        style={{ touchAction: "manipulation" }}
        className={`h-56 w-56 rounded-full text-4xl font-black text-white shadow-2xl transition-transform duration-75 disabled:bg-gray-600 ${
          pressed ? "scale-95 bg-red-700" : "bg-red-500"
        }`}
      >
        押す
      </button>
    </div>
  );
}

/**
 * ボタンの上のランプ。1着は赤く点きっぱなし、2着は赤く点滅、3着以降は消えたまま着順だけ出す。
 * 早押し機の回転灯のように、横じまの入った筒と台座で描く。
 */
function Lamp({ rank }: { rank: number }) {
  const look =
    rank === 1
      ? { cap: "bg-red-500", glow: "0 0 40px 12px rgba(239, 68, 68, 0.8)", label: "1着！", text: "text-red-400" }
      : rank === 2
        ? { cap: "bg-red-500 animate-lamp-blink", glow: "0 0 32px 8px rgba(239, 68, 68, 0.6)", label: "2着", text: "text-red-400" }
        : { cap: "bg-red-950", glow: "none", label: rank > 0 ? `${rank}着` : "", text: "text-gray-400" };

  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <div className="flex flex-col items-center">
        <div
          className={`h-24 w-20 rounded-t-[2rem] rounded-b-md transition-colors ${look.cap}`}
          style={{
            boxShadow: look.glow,
            // 筒の横じま（光を通すカバーの凹凸）
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.18) 0 4px, rgba(0,0,0,0.12) 4px 10px)",
          }}
        />
        <div className="h-3 w-24 rounded-sm bg-gray-300" />
        <div className="h-4 w-28 rounded-b-lg bg-gray-700" />
      </div>
      <p className={`h-9 text-3xl font-black ${look.text}`}>{look.label}</p>
    </div>
  );
}
