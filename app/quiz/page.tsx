import QuizClient from "./QuizClient";
import { getQuizzes } from "@/lib/quizData";

export default async function QuizPage() {
  const quizzes = await getQuizzes();
  return <QuizClient quizzes={quizzes} />;
}
