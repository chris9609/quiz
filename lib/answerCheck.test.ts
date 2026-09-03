import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, isCorrectAnswer } from "./answerCheck.ts";

test("カタカナとひらがなを同一視する", () => {
  assert.equal(normalizeAnswer("コバンザメ"), normalizeAnswer("こばんざめ"));
  assert.ok(isCorrectAnswer("こばんざめ", "コバンザメ"));
});

test("長音符を落とさない（コーヒーとコヒを区別する）", () => {
  assert.notEqual(normalizeAnswer("コーヒー"), normalizeAnswer("コヒ"));
  assert.ok(normalizeAnswer("コーヒー").includes("ー"));
});

test("全角英数・半角カナを NFKC で吸収する", () => {
  assert.ok(isCorrectAnswer("１００ｍＬ", "100mL"));
  assert.ok(isCorrectAnswer("ｱｾﾁﾚﾝ", "アセチレン"));
});

test("英字の大文字小文字を無視する", () => {
  assert.ok(isCorrectAnswer("h2o", "H2O"));
});

test("前後・途中の空白を無視する", () => {
  assert.ok(isCorrectAnswer("  富士山  ", "富士山"));
  assert.ok(isCorrectAnswer("ゴールデン ゲート ブリッジ", "ゴールデン・ゲート・ブリッジ"));
  assert.ok(isCorrectAnswer("富士　山", "富士山"));
});

test("『』などの装飾記号を無視する", () => {
  assert.ok(isCorrectAnswer("武士道", "『武士道』"));
  assert.ok(isCorrectAnswer("『ゲルニカ』", "ゲルニカ"));
});

test("別解（漢字の読み）で正解できる", () => {
  assert.ok(isCorrectAnswer("うちむらこうへい", "内村航平", ["うちむらこうへい"]));
  assert.ok(isCorrectAnswer("ウチムラコウヘイ", "内村航平", ["うちむらこうへい"]));
});

test("空入力は不正解", () => {
  assert.ok(!isCorrectAnswer("", "富士山"));
  assert.ok(!isCorrectAnswer("   ", "富士山"));
  // 記号だけ入力しても、記号を除去した結果が空なら不正解
  assert.ok(!isCorrectAnswer("『』", "『武士道』"));
});

test("違う答えは不正解のまま", () => {
  assert.ok(!isCorrectAnswer("熊本城", "名古屋城"));
  assert.ok(!isCorrectAnswer("東京", "東京都庁"));
});

test("別解が null / undefined でも落ちない（DB から null が来た場合）", () => {
  assert.ok(isCorrectAnswer("富士山", "富士山", null));
  assert.ok(isCorrectAnswer("富士山", "富士山", undefined));
  assert.ok(!isCorrectAnswer("高尾山", "富士山", null));
});
