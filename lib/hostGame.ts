/**
 * 司会画面の進行状況。読み込み直しても続きからできるよう、ブラウザに覚えておく。
 * 部屋とは別に持つ：部屋を作り直しても得点は消さない（消すのは「最初からやり直す」だけ）。
 */

import type { BuzzPayload } from "./buzzer";

export type Judgment = { id: string; result: "correct" | "wrong" };

/** 1問ぶんの記録。「次の問題へ」を押し間違えたときに、押す前へ戻すためにも使う */
export type QuestionState = {
  questionNo: number;
  order: BuzzPayload[];
  judgments: Judgment[];
  /** この問題より前までの得点。名前で数える（別のブラウザで入り直しても同じ人として数えるため） */
  scores: Record<string, number>;
};

export type HostGame = QuestionState & {
  phase: "waiting" | "playing";
  previous: QuestionState | null;
};

export const NEW_GAME: HostGame = {
  phase: "waiting",
  questionNo: 1,
  order: [],
  judgments: [],
  scores: {},
  previous: null,
};

const STORAGE_KEY = "hostGame";

function isBuzz(v: unknown): v is BuzzPayload {
  const b = v as BuzzPayload | null;
  return typeof b?.id === "string" && typeof b?.name === "string";
}

function isJudgment(v: unknown): v is Judgment {
  const j = v as Judgment | null;
  return typeof j?.id === "string" && (j?.result === "correct" || j?.result === "wrong");
}

function parseQuestion(v: unknown): QuestionState | null {
  const q = v as Partial<QuestionState> | null;
  if (typeof q !== "object" || q === null) return null;
  const { questionNo, order, judgments, scores } = q;
  if (!Number.isInteger(questionNo) || (questionNo as number) < 1) return null;
  if (!Array.isArray(order) || !order.every(isBuzz)) return null;
  if (!Array.isArray(judgments) || !judgments.every(isJudgment)) return null;
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) return null;
  if (!Object.values(scores).every((s) => Number.isInteger(s))) return null;
  return { questionNo: questionNo as number, order, judgments, scores };
}

/** 保存された文字列を確かめて戻す。壊れていたら新しいゲームから始める */
export function parseHostGame(raw: string | null): HostGame {
  if (!raw) return NEW_GAME;
  try {
    const data = JSON.parse(raw) as Partial<HostGame> | null;
    const question = parseQuestion(data);
    if (!question || (data?.phase !== "waiting" && data?.phase !== "playing")) return NEW_GAME;
    return { ...question, phase: data.phase, previous: parseQuestion(data.previous) };
  } catch {
    return NEW_GAME;
  }
}

export function loadHostGame(): HostGame {
  try {
    return parseHostGame(localStorage.getItem(STORAGE_KEY));
  } catch {
    return NEW_GAME;
  }
}

export function saveHostGame(game: HostGame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {}
}
