"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // 招待制: 登録済みのユーザーにだけリンクを送る（ここで新規ユーザーを作らない）
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error?.status === 429) {
      setStatus("error");
      return;
    }
    // 未登録のメール（otp_disabled）でも「送りました」と表示する。
    // 出し分けると「このアドレスは登録されている」と外から確かめられてしまうので
    if (error && error.code !== "otp_disabled") console.error(error);
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center space-y-2">
        <p className="text-4xl">📩</p>
        <p className="font-semibold text-gray-800">メールを確認してください</p>
        <p className="text-sm text-gray-600">
          登録済みのアドレスなら、ログイン用のリンクを送りました。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-gray-700">メールアドレス</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="you@example.com"
        />
      </label>

      {status === "error" && (
        <p className="text-sm text-red-600">
          送信回数の上限に達しました。しばらく待ってからもう一度試してください。
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3 rounded-full transition-colors"
      >
        {status === "sending" ? "送信中…" : "ログインリンクを送る"}
      </button>
    </form>
  );
}
