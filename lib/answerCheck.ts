/**
 * 早押しクイズの答え合わせ。
 *
 * 日本語のクイズは表記ゆれが多い（カタカナ/ひらがな、全角/半角、『』の有無、
 * 中黒の有無…）ので、ユーザーの入力と正解を同じ形に正規化してから比較する。
 */

/** カタカナをひらがなに寄せる（長音符「ー」はそのまま残す） */
function katakanaToHiragana(s: string): string {
  // ァ(U+30A1)〜ヴ(U+30F4) の範囲だけを 0x60 引いてひらがなへ。
  // 「ー」(U+30FC) は範囲外なので落ちない ── 落とすと「コーヒー」が「こひ」になり別語と衝突する。
  return s.replace(/[ァ-ヴ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

/**
 * 比較用の正規形にする。
 * NFKC → 記号・空白除去 → カタカナをひらがなへ → ASCII 小文字化。
 */
export function normalizeAnswer(input: string): string {
  return katakanaToHiragana(
    input
      .normalize("NFKC") // 全角英数→半角、半角カナ→全角カナ
      .replace(/[\s　]/g, "") // 空白（半角・全角）を除去
      .replace(/[『』「」（）()【】・･,、.。!！?？~〜\-−―]/g, "") // 装飾記号を除去
  ).toLowerCase();
}

/**
 * ユーザーの回答が正解かどうか。
 * 正式解答 answer と、別解 accepted の「どれか」に正規化後一致すれば正解。
 */
export function isCorrectAnswer(
  userAnswer: string,
  answer: string,
  accepted: string[] | null = []
): boolean {
  const normalized = normalizeAnswer(userAnswer);
  if (normalized === "") return false;
  return [answer, ...(accepted ?? [])].some((a) => normalizeAnswer(a) === normalized);
}
