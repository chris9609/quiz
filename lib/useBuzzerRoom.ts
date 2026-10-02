"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUZZ_EVENT, buzzerChannelName } from "@/lib/buzzer";

const ROOM_STORAGE_KEY = "buzzerRoom";

/** 部屋番号は毎回 QR を読み直さなくて済むよう、ブラウザに覚えておく */
function loadOrCreateRoom() {
  try {
    const saved = localStorage.getItem(ROOM_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  // 推測されると他人が押せてしまうので、連番ではなく UUID にする
  const room = crypto.randomUUID();
  try {
    localStorage.setItem(ROOM_STORAGE_KEY, room);
  } catch {}
  return room;
}

/**
 * スマホからの「押した」を受け取り、onBuzz を呼ぶ。url はスマホで開く URL。
 *
 * onBuzz は phase などで毎回作り直されるが、そのたびにチャンネルへ入り直すと
 * 入り直しの隙間に押された合図を取りこぼす。チャンネルは部屋ごとに1回だけ作り、
 * 最新の onBuzz は ref 経由で呼ぶ。
 *
 * newRoom: 部屋を作り直す（面接デモなどで他人に渡した QR を無効にしたいとき）
 */
export function useBuzzerRoom(onBuzz: () => void) {
  const [room, setRoom] = useState<string | null>(null);
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
    const channel = supabase
      .channel(buzzerChannelName(room))
      .on("broadcast", { event: BUZZ_EVENT }, () => onBuzzRef.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  const newRoom = () => {
    const next = crypto.randomUUID();
    try {
      localStorage.setItem(ROOM_STORAGE_KEY, next);
    } catch {}
    setRoom(next);
  };

  const url = room ? `${window.location.origin}/buzzer?room=${room}` : null;
  return { url, newRoom };
}
