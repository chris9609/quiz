"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** これより短い画面切り替え（通知を見ただけなど）では、つなぎ直さない */
const RECONNECT_AFTER_HIDDEN_MS = 3000;

/**
 * 司会画面・参加者画面でスマホの通信を保つ。
 *   - 画面が自動で消えないようにする（対応ブラウザかつ https のみ。だめなら何もしない）
 *   - スリープから戻ったらつなぎ直す。眠っている間に切れた接続は、ブラウザから見るとまだ
 *     つながっているように見え、押しても届かないので、自動で気づくのを待たない。
 *     同じチャンネルのまま入り直すので、購読や名乗り（SUBSCRIBED のあとの track）はそのまま動く。
 */
export function useStayConnected() {
  useEffect(() => {
    const realtime = createClient().realtime;
    let hiddenAt: number | null = null;
    let reconnecting = false;
    let lock: WakeLockSentinel | null = null;

    const reconnect = async () => {
      if (reconnecting) return;
      reconnecting = true;
      try {
        await realtime.disconnect();
        realtime.connect();
      } catch {
      } finally {
        reconnecting = false;
      }
    };

    const keepScreenOn = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {}
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // スリープに入るときは hidden の通知が来ないことがあるので、記録がなければ長く離れていた扱いにする
      if (hiddenAt === null || Date.now() - hiddenAt >= RECONNECT_AFTER_HIDDEN_MS) void reconnect();
      hiddenAt = null;
      void keepScreenOn();
    };

    // ブラウザの「戻る」で保存された画面から復元されたとき
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void reconnect();
    };

    void keepScreenOn();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", reconnect);
    // ブラウザによっては画面を触った流れでないと許可されないので、触るたびに確かめる
    window.addEventListener("pointerdown", keepScreenOn);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("pointerdown", keepScreenOn);
      void lock?.release().catch(() => {});
    };
  }, []);
}
