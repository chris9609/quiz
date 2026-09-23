/**
 * 1プレイ分の回答結果。クイズ画面 → 結果画面へ sessionStorage で受け渡す
 * （スコアなどの集計値は URL で渡しているが、10 問分の本文は URL に載せるには長すぎる）。
 */
export type QuizResult = {
  question: string
  answer: string
  userAnswer: string
  correct: boolean
  charsShown: number
  totalChars: number
  score: number
}

export const QUIZ_RESULTS_STORAGE_KEY = 'quiz:lastResults'

export function saveQuizResults(results: QuizResult[]) {
  try {
    sessionStorage.setItem(QUIZ_RESULTS_STORAGE_KEY, JSON.stringify(results))
  } catch {
    // プライベートブラウズ等で書けなくても、結果画面で一覧が出ないだけにする
  }
}
