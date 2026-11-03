// 司会モード（/host）をひとりで試すための、ダミー参加者。
// 架空の参加者を部屋に入れ、Enter を押すたびに全員がばらばらのタイミングで早押しする。
//
// 使い方（司会画面の QR の URL か、room= の後ろの文字列を渡す）:
//   node --env-file=.env.local scripts/fake_buzzers.mjs "https://quiz-lime-pi.vercel.app/buzzer?room=xxxx" [人数]
//
// Enter: 1問ぶん押させる / q + Enter: 終了（Ctrl+C でも可）

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

// lib/buzzer.ts と同じ約束ごと（.ts は node から直接読めないので写している）
const BUZZ_EVENT = "buzz";
const channelName = (room) => `buzzer:${room}`;

const NAMES = [
  "たろう", "はなこ", "新郎の父", "新婦の友人A", "けんた",
  "さくら", "部長", "ゆうこ", "じろう", "めぐみ",
  "おじいちゃん", "たけし", "あやか", "しょう", "みき",
];

const [arg, countArg] = process.argv.slice(2);
if (!arg) {
  console.error('使い方: node --env-file=.env.local scripts/fake_buzzers.mjs "<QR の URL か room>" [人数]');
  process.exit(1);
}
const room = arg.includes("room=") ? new URL(arg).searchParams.get("room") : arg;
const count = Math.min(Math.max(Number(countArg) || 8, 1), NAMES.length);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Supabase の URL / キーがありません。--env-file=.env.local を付けて実行してください");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// スマホ1台 = Supabase クライアント1つ（同じクライアントで同じ部屋に何度も入れないため）
async function joinBot(name) {
  const client = createClient(url, key);
  const channel = client.channel(channelName(room));
  await new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`${name}: ${status}`));
    });
  });
  await channel.track({ role: "buzzer", name });
  const id = randomUUID();
  const buzz = () => channel.send({ type: "broadcast", event: BUZZ_EVENT, payload: { id, name } });
  return { name, buzz, leave: () => client.removeAllChannels() };
}

console.log(`部屋 ${room} に ${count}人 入ります…`);
const bots = [];
for (const name of NAMES.slice(0, count)) {
  bots.push(await joinBot(name));
  console.log(`  ● ${name}`);
  await sleep(300); // 参加者欄に1人ずつ増えていくのを見られるように
}

let round = 0;
async function buzzRound() {
  round += 1;
  console.log(`\n--- ${round}問目: みんな押します ---`);
  const plans = bots.map((bot) => ({
    bot,
    // だいたいは 0.3〜3秒でばらける。たまにほぼ同時（0〜50ms）の押し合いも混ぜる
    at: Math.random() < 0.25 ? Math.random() * 50 : 300 + Math.random() * 2700,
    // 連打する人もいる（司会画面では最初の1回だけ数えられるはず）
    mash: Math.random() < 0.3,
  }));
  plans.sort((a, b) => a.at - b.at);
  for (const p of plans) console.log(`  ${String(Math.round(p.at)).padStart(4)}ms  ${p.bot.name}${p.mash ? "（連打）" : ""}`);

  await Promise.all(
    plans.map(async ({ bot, at, mash }) => {
      await sleep(at);
      await bot.buzz();
      if (mash) for (let i = 0; i < 3; i++) { await sleep(80); await bot.buzz(); }
    }),
  );
  console.log("押し終わりました。司会画面でリセット → また Enter");
}

async function quit() {
  console.log("\n退出します");
  await Promise.all(bots.map((b) => b.leave()));
  process.exit(0);
}
process.on("SIGINT", quit);

console.log("\n準備OK。Enter で1問ぶん押させます（q + Enter で終了）");
const rl = readline.createInterface({ input: process.stdin });
let busy = false;
rl.on("line", async (line) => {
  if (line.trim() === "q") return quit();
  if (busy) return;
  busy = true;
  await buzzRound();
  busy = false;
});
