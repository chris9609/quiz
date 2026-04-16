import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      <div className="text-center space-y-8 p-8">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold text-indigo-900">⚡ 早押しクイズ</h1>
          <p className="text-lg text-indigo-600">問題文が1文字ずつ表示される早押しクイズ</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md mx-auto text-left space-y-3">
          <h2 className="font-semibold text-gray-700 text-lg">ルール</h2>
          <ul className="space-y-2 text-gray-600 text-sm">
            <li>📖 問題文が1文字ずつ表示されます</li>
            <li>⌨️ わかった瞬間に <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> を押してください</li>
            <li>✍️ 回答を入力して送信します</li>
            <li>🏆 少ない文字数で正解するほど高得点！</li>
          </ul>
        </div>

        <Link
          href="/quiz"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5"
        >
          スタート！
        </Link>
      </div>
    </div>
  );
}
