import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateScore, MAX_SCORE_PER_QUESTION } from "./score.ts";

test("1文字も表示されないうちに正解すると満点", () => {
  assert.equal(calculateScore(50, 0), MAX_SCORE_PER_QUESTION);
});

test("全文表示されてから正解しても0点にはならない（基礎点が残る）", () => {
  const score = calculateScore(50, 50);
  assert.ok(score > 0, "全文表示で 0 点になっている");
  assert.equal(score, 300);
});

test("早く押すほど高得点になる", () => {
  assert.ok(calculateScore(100, 10) > calculateScore(100, 50));
  assert.ok(calculateScore(100, 50) > calculateScore(100, 90));
});

test("スコアは常に満点以下", () => {
  for (const shown of [0, 1, 25, 50, 99, 100]) {
    const score = calculateScore(100, shown);
    assert.ok(score <= MAX_SCORE_PER_QUESTION, `shown=${shown} で満点を超えた`);
  }
});

test("表示文字数が総文字数を超えても破綻しない", () => {
  assert.equal(calculateScore(10, 999), 300);
});

test("総文字数0でも例外にならない", () => {
  assert.equal(calculateScore(0, 0), 300);
});
