import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_GAME, parseHostGame, type HostGame } from "./hostGame.ts";

const game: HostGame = {
  phase: "playing",
  questionNo: 3,
  order: [{ id: "a", name: "たろう" }],
  judgments: [{ id: "a", result: "wrong" }],
  scores: { はなこ: 2 },
  previous: { questionNo: 2, order: [], judgments: [], scores: { はなこ: 1 } },
};

test("保存した内容をそのまま戻す", () => {
  assert.deepEqual(parseHostGame(JSON.stringify(game)), game);
});

test("何も保存されていなければ新しいゲーム", () => {
  assert.deepEqual(parseHostGame(null), NEW_GAME);
});

test("壊れた内容なら新しいゲーム", () => {
  for (const raw of [
    "{こわれた",
    "null",
    "[]",
    JSON.stringify({ ...game, phase: "x" }),
    JSON.stringify({ ...game, questionNo: 0 }),
    JSON.stringify({ ...game, order: [{ id: 1 }] }),
    JSON.stringify({ ...game, judgments: [{ id: "a", result: "?" }] }),
    JSON.stringify({ ...game, scores: { たろう: "1" } }),
  ]) {
    assert.deepEqual(parseHostGame(raw), NEW_GAME, raw);
  }
});

test("1問前の記録だけ壊れていたら、それだけ捨てて続ける", () => {
  const parsed = parseHostGame(JSON.stringify({ ...game, previous: { questionNo: "?" } }));
  assert.deepEqual(parsed, { ...game, previous: null });
});
