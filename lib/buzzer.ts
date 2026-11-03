/** スマホの早押しボタンと PC のクイズ画面をつなぐ Realtime broadcast の約束ごと */

import type { RealtimeChannel } from "@supabase/supabase-js";

export const BUZZ_EVENT = "buzz";

/** スマホで入力する名前の上限。PC の小さな表示欄に収まる長さにしておく */
export const BUZZER_NAME_MAX = 10;

export function buzzerChannelName(room: string) {
  return `buzzer:${room}`;
}

/**
 * 押したときに送る内容。司会画面で「誰が押したか」を出すため。
 * id はスマホごとの印で、同じ名前の人が2人いても別人として数えるのに使う。
 */
export type BuzzPayload = { id: string; name: string };

/** 届いた payload を確かめる。古い画面のままのスマホは中身なし（{}）で送ってくる */
export function parseBuzzPayload(payload: unknown): BuzzPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { id, name } = payload as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string" || !name.trim()) return null;
  return { id, name: name.trim().slice(0, BUZZER_NAME_MAX) };
}

/**
 * 司会画面から全員のスマホへ送る「今の押した順」。スマホは自分の id が何番目かを見てランプを点ける。
 * 次の問題に進むと空の配列が届き、ランプが消える。
 */
export const RANKING_EVENT = "ranking";

export function parseRanking(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const { ids } = payload as Record<string, unknown>;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
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
