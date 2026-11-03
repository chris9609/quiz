"use client";

import { useEffect, useId, useRef, useState } from "react";
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
 * 早押し機の回転灯のように、赤いカバー（丸みの陰影・ガラスの反射・凹凸）と金属の台座を SVG で描く。
 * 消灯中のカバーの上に「光っている層」を重ね、その層の濃さだけで点灯・点滅を切り替える。
 */
function Lamp({ rank }: { rank: number }) {
  // SVG の url(#...) で困らないよう、記号を取り除いた id にする
  const uid = "lamp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `${uid}-${name}`;
  const on = rank === 1 || rank === 2;
  const lightClass = rank === 2 ? "animate-lamp-blink" : "";
  const label = rank === 1 ? "1着！" : rank > 0 ? `${rank}着` : "";

  // カバーの形：上が半円のドーム、下はまっすぐな筒
  const dome = "M22 122 V60 A38 38 0 0 1 98 60 V122 Z";

  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <div className="relative">
        {/* 周りに広がる赤い光 */}
        <div
          className={`pointer-events-none absolute left-1/2 top-[42%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-100 ${lightClass}`}
          style={{
            opacity: on ? 1 : 0,
            background: "radial-gradient(circle, rgba(255,60,40,0.55) 0%, rgba(255,30,20,0.25) 35%, rgba(255,0,0,0) 70%)",
          }}
        />
        <svg viewBox="0 0 120 160" className="relative h-44 w-[8.25rem]" aria-hidden="true">
          <defs>
            {/* 筒の丸み：両端が暗く、真ん中が明るい */}
            <linearGradient id={id("off")} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#1f0505" />
              <stop offset="0.45" stopColor="#5a0d0d" />
              <stop offset="0.6" stopColor="#4a0a0a" />
              <stop offset="1" stopColor="#1a0404" />
            </linearGradient>
            <linearGradient id={id("on")} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#991b1b" />
              <stop offset="0.45" stopColor="#ff4d3d" />
              <stop offset="0.6" stopColor="#f43f2e" />
              <stop offset="1" stopColor="#7f1010" />
            </linearGradient>
            {/* 中の電球の光 */}
            <radialGradient id={id("bulb")} cx="0.5" cy="0.55" r="0.5">
              <stop offset="0" stopColor="#fffbe6" />
              <stop offset="0.25" stopColor="#ffd2a8" />
              <stop offset="0.55" stopColor="#ff6b4a" stopOpacity="0.7" />
              <stop offset="1" stopColor="#ff2a1a" stopOpacity="0" />
            </radialGradient>
            {/* ガラスの反射（縦の白い筋） */}
            <linearGradient id={id("shine")} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="0.6" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            {/* カバーの横じまの凹凸 */}
            <pattern id={id("ridge")} width="4" height="6" patternUnits="userSpaceOnUse">
              <rect width="4" height="2" fill="#fff" fillOpacity="0.12" />
              <rect y="3" width="4" height="3" fill="#000" fillOpacity="0.18" />
            </pattern>
            {/* 金属のリング */}
            <linearGradient id={id("chrome")} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f5f5f5" />
              <stop offset="0.45" stopColor="#9ca3af" />
              <stop offset="0.55" stopColor="#6b7280" />
              <stop offset="1" stopColor="#d1d5db" />
            </linearGradient>
            <linearGradient id={id("base")} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#0a0a0a" />
              <stop offset="0.4" stopColor="#3f3f46" />
              <stop offset="1" stopColor="#09090b" />
            </linearGradient>
            <clipPath id={id("clip")}>
              <path d={dome} />
            </clipPath>
          </defs>

          {/* 消灯中のカバーと、うっすら見える中の電球 */}
          <path d={dome} fill={`url(#${id("off")})`} />
          <g clipPath={`url(#${id("clip")})`} opacity="0.35">
            <rect x="52" y="70" width="16" height="44" rx="3" fill="#2b2b2b" />
            <ellipse cx="60" cy="68" rx="11" ry="13" fill="#3a3a3a" />
          </g>

          {/* 点灯した層（点滅はこの層ごと消したり点けたりする） */}
          <g
            className={`transition-opacity duration-100 ${lightClass}`}
            style={{ opacity: on ? 1 : 0 }}
            clipPath={`url(#${id("clip")})`}
          >
            <path d={dome} fill={`url(#${id("on")})`} />
            <ellipse cx="60" cy="74" rx="40" ry="52" fill={`url(#${id("bulb")})`} />
          </g>

          {/* カバーの凹凸とガラスの反射（点灯中も消灯中も見える） */}
          <path d={dome} fill={`url(#${id("ridge")})`} />
          <rect x="33" y="34" width="7" height="82" rx="3.5" fill={`url(#${id("shine")})`} />
          <rect x="84" y="50" width="3" height="60" rx="1.5" fill="#fff" fillOpacity="0.12" />
          <path d={dome} fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1" />

          {/* 台座：金属のリング＋黒い土台 */}
          <rect x="17" y="120" width="86" height="10" rx="2" fill={`url(#${id("chrome")})`} />
          <path d="M14 130 H106 L112 150 Q112 154 108 154 H12 Q8 154 8 150 Z" fill={`url(#${id("base")})`} />
          <rect x="14" y="130" width="92" height="1.5" fill="#fff" fillOpacity="0.15" />
        </svg>
      </div>
      <p className={`h-9 text-3xl font-black ${on ? "text-red-400" : "text-gray-400"}`}>{label}</p>
    </div>
  );
}
