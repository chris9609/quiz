export type Quiz = {
  id: string;
  question: string;
  answer: string;
};

export const quizzes: Quiz[] = [
  { id: "1", question: "日本で一番高い山はどこですか？", answer: "富士山" },
  { id: "2", question: "1年は何日ありますか？", answer: "365" },
  { id: "3", question: "水の化学式は何ですか？", answer: "H2O" },
  { id: "4", question: "太陽系で一番大きな惑星は何ですか？", answer: "木星" },
  { id: "5", question: "日本の首都はどこですか？", answer: "東京" },
  { id: "6", question: "人間の体の中で一番大きな臓器は何ですか？", answer: "肝臓" },
  { id: "7", question: "世界で一番長い川はどこですか？", answer: "ナイル川" },
  { id: "8", question: "サッカーのワールドカップは何年ごとに開催されますか？", answer: "4" },
  { id: "9", question: "日本語で「ありがとう」を英語で言うと何ですか？", answer: "thank you" },
  { id: "10", question: "光の速さは秒速約何万キロメートルですか？", answer: "30" },
];

export function calculateScore(totalChars: number, charsShown: number): number {
  if (totalChars === 0) return 0;
  const ratio = charsShown / totalChars;
  return Math.round((1 - ratio) * 1000);
}
