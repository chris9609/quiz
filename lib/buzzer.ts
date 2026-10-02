/** スマホの早押しボタンと PC のクイズ画面をつなぐ Realtime broadcast の約束ごと */

import type { RealtimeChannel } from "@supabase/supabase-js";

export const BUZZ_EVENT = "buzz";

export function buzzerChannelName(room: string) {
  return `buzzer:${room}`;
}

/** Presence で名乗る役割。PC（出題側）は host、スマホは buzzer */
export type BuzzerRole = "host" | "buzzer";

/** 部屋にいる、指定した役割の端末の数 */
export function countRole(channel: RealtimeChannel, role: BuzzerRole) {
  return Object.values(channel.presenceState<{ role: BuzzerRole }>())
    .flat()
    .filter((p) => p.role === role).length;
}
