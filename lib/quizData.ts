import { supabase } from './supabase'
import { QUESTIONS_PER_GAME } from './score'

export type Quiz = {
  id: string
  question: string
  answer: string
  accepted_answers: string[]
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
 * ランダムに QUESTIONS_PER_GAME 問を取り出す。
 * 現状は全件取得してからシャッフルしている。問題数が数千件規模になったら
 * Postgres 側で order by random() する RPC に切り替えること。
 */
export async function getQuizzes(limit = QUESTIONS_PER_GAME): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, question, answer, accepted_answers')

  if (error) throw error
  // DB の型は保証されていないので、accepted_answers が null で来ても壊れないようにする
  const rows = (data ?? []).map((q) => ({ ...q, accepted_answers: q.accepted_answers ?? [] }))
  return shuffle(rows).slice(0, limit)
}
