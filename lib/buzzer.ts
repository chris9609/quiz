/** スマホの早押しボタンと PC のクイズ画面をつなぐ Realtime broadcast の約束ごと */

export const BUZZ_EVENT = "buzz";

export function buzzerChannelName(room: string) {
  return `buzzer:${room}`;
}
