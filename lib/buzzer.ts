/** スマホの早押しボタンと PC のクイズ画面をつなぐ Realtime broadcast の約束ごと */

import type { RealtimeChannel } from "@supabase/supabase-js";

export const BUZZ_EVENT = "buzz";

/** スマホで入力する名前の上限。PC の小さな表示欄に収まる長さにしておく */
export const BUZZER_NAME_MAX = 10;

export function buzzerChannelName(room: string) {
  return `buzzer:${room}`;
}

/** Presence で名乗る内容。PC（出題側）は host、スマホは buzzer で名前も添える */
export type BuzzerPresence = { role: "host" } | { role: "buzzer"; name: string };

function presences(channel: RealtimeChannel) {
  return Object.values(channel.presenceState<BuzzerPresence>()).flat();
}

/** 部屋に PC（出題側）がいるか */
export function hasHost(channel: RealtimeChannel) {
  return presences(channel).some((p) => p.role === "host");
}

/** 部屋にいるスマホの名前（つないだ台数ぶん） */
export function buzzerNames(channel: RealtimeChannel) {
  return presences(channel).flatMap((p) => (p.role === "buzzer" ? [p.name] : []));
}
