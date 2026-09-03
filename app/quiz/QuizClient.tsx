"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { type Quiz } from "@/lib/quizData";
import { calculateScore } from "@/lib/score";
import { isCorrectAnswer } from "@/lib/answerCheck";

type QuizResult = {
  question: string;
  answer: string;
  userAnswer: string;
  correct: boolean;
  charsShown: number;
  totalChars: number;
  score: number;
};

type Phase = "revealing" | "answering" | "feedback";

const CHAR_INTERVAL_MS = 100;
/** 回答送信の Enter がそのまま「次へ」に貫通しないよう、feedback 直後は Enter を無視する */
const FEEDBACK_ENTER_GRACE_MS = 400;

export default function QuizClient({ quizzes }: { quizzes: Quiz[] }) {
  const router = useRouter();
  const questions = quizzes;

  const [questionIndex, setQuestionIndex] = useState(0);
  const [charsShown, setCharsShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("revealing");
  const [userAnswer, setUserAnswer] = useState("");
  const [lastResult, setLastResult] = useState<{ correct: boolean; score: number; answer: string } | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackAtRef = useRef(0);

  const currentQuiz = questions[questionIndex];
  const displayedText = currentQuiz.question.slice(0, charsShown);

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const stopRevealing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPhase("answering");
    focusInput();
  }, []);

  // 問題文を1文字ずつ表示する。
  // state のリセットは「次の問題へ」を押したときに行うので、この effect は
  // タイマーという外部システムの開始／停止だけを担当する。
  useEffect(() => {
    if (phase !== "revealing") return;

    const totalChars = questions[questionIndex].question.length;
    intervalRef.current = setInterval(() => {
      setCharsShown((prev) => {
        if (prev >= totalChars) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setPhase("answering");
          focusInput();
          return prev;
        }
        return prev + 1;
      });
    }, CHAR_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [questionIndex, phase, questions]);

  const submitAnswer = () => {
    const trimmed = userAnswer.trim();
    const correct = isCorrectAnswer(
      trimmed,
      currentQuiz.answer,
      currentQuiz.accepted_answers
    );
    const score = correct
      ? calculateScore(currentQuiz.question.length, charsShown)
      : 0;

    const result: QuizResult = {
      question: currentQuiz.question,
      answer: currentQuiz.answer,
      userAnswer: trimmed,
      correct,
      charsShown,
      totalChars: currentQuiz.question.length,
      score,
    };

    feedbackAtRef.current = Date.now();
    setLastResult({ correct, score, answer: currentQuiz.answer });
    setResults((prev) => [...prev, result]);
    setPhase("feedback");
  };

  const nextQuestion = useCallback(() => {
    const nextIndex = questionIndex + 1;
    if (nextIndex >= questions.length) {
      const totalScore = results.reduce((s, r) => s + r.score, 0);
      const correctCount = results.filter((r) => r.correct).length;
      router.push(
        `/result?score=${totalScore}&correct=${correctCount}&total=${questions.length}`
      );
      return;
    }
    // 次の問題ぶんの state をここでまとめてリセットする
    setQuestionIndex(nextIndex);
    setCharsShown(0);
    setUserAnswer("");
    setLastResult(null);
    setPhase("revealing");
  }, [questionIndex, questions.length, results, router]);

  // Enter: 出題中は表示を止める / 正誤表示中は次の問題へ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (phase === "revealing") {
        e.preventDefault();
        stopRevealing();
      } else if (phase === "feedback") {
        if (Date.now() - feedbackAtRef.current < FEEDBACK_ENTER_GRACE_MS) return;
        e.preventDefault();
        nextQuestion();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, stopRevealing, nextQuestion]);

  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME で変換確定した Enter は送信扱いにしない
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitAnswer();
    }
  };

  const progress = ((questionIndex + 1) / questions.length) * 100;

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-indigo-700 font-medium">
            <span>問題 {questionIndex + 1} / {questions.length}</span>
            <span>
              {phase === "revealing"
                ? `${charsShown} / ${currentQuiz.question.length} 文字`
                : `${charsShown} 文字表示済み`}
            </span>
          </div>
          <div className="w-full bg-indigo-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 min-h-[160px] flex items-center justify-center">
          <p className="text-2xl font-semibold text-gray-800 text-center leading-relaxed">
            {displayedText}
            {phase === "revealing" && (
              <span className="inline-block w-0.5 h-6 bg-indigo-500 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>

        {phase === "revealing" && (
          <div className="text-center">
            <p className="text-indigo-600 text-sm mb-3">わかった瞬間に押してください</p>
            <button
              onClick={stopRevealing}
              className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold text-lg px-10 py-3 rounded-full shadow transition-all duration-150 hover:shadow-md"
            >
              ⏹ 止める（Enter）
            </button>
          </div>
        )}

        {phase === "answering" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <p className="text-gray-600 font-medium text-center">回答を入力してください</p>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyDown={handleAnswerKeyDown}
                placeholder="回答を入力..."
                className="flex-1 border-2 border-indigo-300 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-lg"
              />
              <button
                onClick={submitAnswer}
                disabled={userAnswer.trim() === ""}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-bold px-6 py-3 rounded-xl transition-colors"
              >
                送信
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              ひらがな・カタカナどちらでも、漢字の読みでも正解になります
            </p>
          </div>
        )}

        {phase === "feedback" && lastResult && (
          <div
            className={`rounded-2xl shadow-lg p-6 space-y-3 ${
              lastResult.correct ? "bg-green-50 border-2 border-green-400" : "bg-red-50 border-2 border-red-400"
            }`}
          >
            <div className="text-center">
              <span className="text-4xl">{lastResult.correct ? "⭕" : "❌"}</span>
              <p className={`text-xl font-bold mt-1 ${lastResult.correct ? "text-green-700" : "text-red-700"}`}>
                {lastResult.correct ? "正解！" : "不正解"}
              </p>
            </div>
            <p className="text-center text-gray-600">
              正解: <span className="font-bold text-gray-800">{lastResult.answer}</span>
            </p>
            {lastResult.correct && (
              <p className="text-center text-green-700 font-semibold text-lg">
                +{lastResult.score} 点
              </p>
            )}
            <div className="text-center">
              <button
                onClick={nextQuestion}
                className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-full shadow transition-colors"
              >
                {questionIndex + 1 >= questions.length ? "結果を見る" : "次の問題へ →"}
              </button>
              <p className="text-xs text-gray-400 mt-2">Enter でも進めます</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
