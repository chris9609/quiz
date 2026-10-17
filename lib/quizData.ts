import { createClient } from './supabase/server'

export type Quiz = {
  id: string
  question: string
  answer: string
  accepted_answers: string[]
}

/** 1プレイあたりの出題数（指定がないとき） */
export const QUESTIONS_PER_GAME = 10

/** トップで選べる出題数 */
export const QUESTION_COUNT_OPTIONS = [5, 10, 20, 30] as const

/**
 * URL の ?n= を出題数にする。数字でない・範囲外のときは既定値に戻す。
 * 選択肢以外の数も通すのは、問題が足りず「もう一度」に 7 問などで戻ってくることがあるため。
 */
export function parseQuestionCount(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  const max = QUESTION_COUNT_OPTIONS[QUESTION_COUNT_OPTIONS.length - 1]
  return Number.isInteger(n) && n >= 1 && n <= max ? n : QUESTIONS_PER_GAME
}

/** Fisher-Yates シャッフル（引数は破壊しない） */
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * ランダムに limit 問を取り出す。
 * 現状は全件取得してからシャッフルしている。問題数が数千件規模になったら
 * Postgres 側で order by random() する RPC に切り替えること。
 */
export async function getQuizzes(limit = QUESTIONS_PER_GAME): Promise<Quiz[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, question, answer, accepted_answers')

  if (error) throw error
  // DB の型は保証されていないので、accepted_answers が null で来ても壊れないようにする
  const rows = (data ?? []).map((q) => ({ ...q, accepted_answers: q.accepted_answers ?? [] }))
  return shuffle(rows).slice(0, limit)
}
