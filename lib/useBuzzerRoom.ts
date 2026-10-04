"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUZZ_EVENT, buzzerChannelName, buzzerNames } from "@/lib/buzzer";

const ROOM_STORAGE_KEY = "buzzerRoom";

/**
 * 部屋番号は毎回 QR を読み直さなくて済むよう、ブラウザに覚えておく。
 * トップページでつないだ部屋を、そのままクイズ画面でも使うためでもある。
 */
function loadOrCreateRoom() {
  try {
    const saved = localStorage.getItem(ROOM_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  return saveNewRoom();
}

function saveNewRoom() {
  // 推測されると他人が押せてしまうので、連番ではなく UUID にする
  const room = crypto.randomUUID();
  try {
    localStorage.setItem(ROOM_STORAGE_KEY, room);
  } catch {}
  return room;
}

/**
 * PC 側から早押しの部屋に入る。
 *   url:        スマホで開く URL（QR にする）
 *   phoneNames: 部屋にいるスマホの名前（Presence で受け取る）
 *   newRoom:    部屋を作り直す（面接デモなどで他人に渡した QR を無効にしたいとき）
 *
 * onBuzz は phase などで毎回作り直されるが、そのたびにチャンネルへ入り直すと
 * 入り直しの隙間に押された合図を取りこぼす。チャンネルは部屋ごとに1回だけ作り、
 * 最新の onBuzz は ref 経由で呼ぶ。
 */
export function useBuzzerRoom(onBuzz?: () => void) {
  const [room, setRoom] = useState<string | null>(null);
  const [phoneNames, setPhoneNames] = useState<string[]>([]);
  const onBuzzRef = useRef(onBuzz);

  useEffect(() => {
    onBuzzRef.current = onBuzz;
  });

  // サーバーとブラウザで値がずれないよう、部屋番号はブラウザ側で決める
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage はブラウザでしか読めない
    setRoom(loadOrCreateRoom());
  }, []);

  useEffect(() => {
    if (!room) return;
    const supabase = createClient();
    const channel = supabase.channel(buzzerChannelName(room));
    channel
      .on("broadcast", { event: BUZZ_EVENT }, () => onBuzzRef.current?.())
      .on("presence", { event: "sync" }, () => setPhoneNames(buzzerNames(channel)))
      .subscribe((status) => {
        // スマホ側に「PC とつながっている」と見せるため、自分も名乗っておく
        if (status === "SUBSCRIBED") channel.track({ role: "host" });
      });
    return () => {
      setPhoneNames([]);
      supabase.removeChannel(channel);
    };
  }, [room]);

  const newRoom = () => setRoom(saveNewRoom());

  const url = room ? `${phoneOrigin()}/buzzer?room=${room}` : null;
  return { url, phoneNames, newRoom };
}

/**
 * スマホから開ける origin。PC で localhost を開いていると QR も localhost になり
 * スマホから届かないので、開発中は Mac の LAN 内 IP に差し替える。
 */
function phoneOrigin(): string {
  const { protocol, hostname, port, origin } = window.location;
  const lanHost = process.env.NEXT_PUBLIC_DEV_LAN_HOST;
  if (hostname === "localhost" && lanHost) {
    return `${protocol}//${lanHost}${port ? `:${port}` : ""}`;
  }
  return origin;
}
