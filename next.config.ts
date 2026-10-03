import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * 開発中、同じネットワークのスマホから早押しボタン（/buzzer）を開けるように、
 * Mac の LAN 内アドレスを調べておく。本番（Vercel）では使わない。
 * うまく選べないときは DEV_LAN_HOST=... で上書きできる。
 */
function findLanHost(): string | undefined {
  if (process.env.DEV_LAN_HOST) return process.env.DEV_LAN_HOST;
  const wifi = networkInterfaces().en0 ?? [];
  // 192.0.0.x は IPv6 だけのテザリングで付く仮の IPv4（外から届かない）
  const v4 = wifi.find((i) => i.family === "IPv4" && !i.address.startsWith("192.0.0."));
  if (v4) return v4.address;
  // IPv6 だけの回線（iPhone のテザリング等）なら、一時的でないグローバル IPv6 を使う
  const v6 = wifi.find((i) => i.family === "IPv6" && !i.address.startsWith("fe80"));
  return v6 ? `[${v6.address}]` : undefined;
}

const lanHost = process.env.NODE_ENV === "development" ? findLanHost() : undefined;

const nextConfig: NextConfig = {
  // スマホ（LAN アドレス）からの dev サーバーへのアクセスを許可する
  allowedDevOrigins: lanHost ? [lanHost] : [],
  env: { NEXT_PUBLIC_DEV_LAN_HOST: lanHost ?? "" },
};

export default nextConfig;
