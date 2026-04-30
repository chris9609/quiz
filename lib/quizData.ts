import { supabase } from './supabase'

export type Quiz = {
  id: string
  question: string
  answer: string
}

export async function getQuizzes(): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, question, answer')
    .order('created_at')

  if (error) throw error
  return data
}

export function calculateScore(totalChars: number, charsShown: number): number {
  if (totalChars === 0) return 0
  const ratio = charsShown / totalChars
  return Math.round((1 - ratio) * 1000)
}
