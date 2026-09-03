/**
 * スコア計算。DB にもブラウザにも依存しない純粋関数だけを置く
 * （lib/quizData.ts は supabase クライアントを読み込むので、ここに分けてテスト可能にしている）。
 */

/** 1プレイあたりの出題数 */
export const QUESTIONS_PER_GAME = 10

/** 正解したときの基礎点。ここに速度ボーナスが乗る */
const BASE_SCORE = 300
/** 早く押すほど乗るボーナスの上限（BASE_SCORE と合わせて 1 問 1000 点満点） */
const SPEED_BONUS_MAX = 700

/** 満点（結果画面の達成率・ランク計算に使う） */
export const MAX_SCORE_PER_QUESTION = BASE_SCORE + SPEED_BONUS_MAX

/**
 * 1 問あたりのスコア。
 * 正解なら基礎点が入り、そこに「残り何文字で押せたか」の割合でボーナスが乗る。
 * 全文表示されてから答えても基礎点は残る（0 点にはしない）。
 */
export function calculateScore(totalChars: number, charsShown: number): number {
  if (totalChars <= 0) return BASE_SCORE
  const shown = Math.min(Math.max(charsShown, 0), totalChars)
  const remainingRatio = 1 - shown / totalChars
  return BASE_SCORE + Math.round(remainingRatio * SPEED_BONUS_MAX)
}
