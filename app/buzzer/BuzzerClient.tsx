"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BUZZ_EVENT, buzzerChannelName } from "@/lib/buzzer";

type Status = "connecting" | "ready" | "error";

export default function BuzzerClient({ room }: { room: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [pressed, setPressed] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(buzzerChannelName(room));
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("ready");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [room]);

  // onClick は指を離したときに発火するので遅い。触れた瞬間に送る
  const buzz = () => {
    if (status !== "ready" || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: BUZZ_EVENT, payload: {} });
    setPressed(true);
    setTimeout(() => setPressed(false), 300);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-900 p-6 select-none">
      <p className="text-sm text-gray-400">
        {status === "ready" ? "接続済み" : status === "connecting" ? "接続中…" : "接続できませんでした。再読み込みしてください"}
      </p>
      <button
        onPointerDown={buzz}
        disabled={status !== "ready"}
        style={{ touchAction: "manipulation" }}
        className={`h-64 w-64 rounded-full text-4xl font-black text-white shadow-2xl transition-transform duration-75 disabled:bg-gray-600 ${
          pressed ? "scale-95 bg-red-700" : "bg-red-500"
        }`}
      >
        押す
      </button>
    </div>
  );
}
