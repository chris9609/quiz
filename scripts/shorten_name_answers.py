"""
人名の答えをフルネームから姓や通称に短くする。元のフルネームは別解に残すので、どちらでも正解になる。

機械的に分割しないのは、ダ・ヴィンチ／コナン・ドイルのように複数語の通称や、
ジャンヌ・ダルク／イブン・バットゥータのように分けられない名前があるから。
既存の別解は残す。一度短くした問題は対象の答えと一致しなくなるので、実行し直しても変わらない。

使い方:
  python3 scripts/shorten_name_answers.py                       # 変更内容を表示するだけ
  python3 scripts/shorten_name_answers.py --apply BACKUP.json   # 全行を BACKUP.json に保存してから書き込む
"""
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_io import _request, _secret_key  # noqa: E402

# 現在の答え → [新しい答え, 追加の別解...]（元のフルネームは自動で別解に残す）
SHORT_NAMES: dict[str, list[str]] = {
    "ヘルムート・カール・ベルンハルト・フォン・モルトケ": ["モルトケ", "大モルトケ"],
    "ライアン・ゴズリング": ["ゴズリング"],
    "カール・マルクス": ["マルクス"],
    "フランク・ライカールト": ["ライカールト"],
    "リーゼ・マイトナー": ["マイトナー"],
    "マックス・プランク": ["プランク"],
    "レオナルド・ダ・ヴィンチ": ["ダ・ヴィンチ", "レオナルド"],
    "ラインハルト・ハイドリヒ": ["ハイドリヒ"],
    "アーサー・バルフォア": ["バルフォア"],
    "ウラジーミル・レーニン": ["レーニン"],
    "デビッド・ロイド・ジョージ": ["ロイド・ジョージ"],
    "ジョージ・グレンヴィル": ["グレンヴィル"],
    "フェルディナント・ラッサール": ["ラッサール"],
    "アーサー・コナン・ドイル": ["コナン・ドイル", "ドイル"],
    "ジョゼフ・プリーストリー": ["プリーストリー"],
    "オードリー・ヘプバーン": ["ヘプバーン"],
    "ムハンマド・アリー・ジンナー": ["ジンナー"],
    "ヨハン・サンタナ": ["サンタナ"],
    "ハインリヒ・ヒムラー": ["ヒムラー"],
    "ハーバート・ヘンリー・アスキス": ["アスキス"],
    "レオ・シラード": ["シラード"],
    "エドワード・エルガー": ["エルガー"],
    "アナスタシア・ニコラエヴナ": ["アナスタシア"],
    "スペンサー・パーシヴァル": ["パーシヴァル"],
    "ヨシップ・ブロズ・チトー": ["チトー"],
    "ロバート・ピール": ["ピール"],
    "ジェームズ・ワット": ["ワット"],
    "ジョゼフ・チェンバレン": ["チェンバレン"],
    "ネイト・シルバー": ["シルバー"],
    "トーマス・マコーリー": ["マコーリー"],
    "ジョージ・カニング": ["カニング"],
    "ジョルジュ・ビゴー": ["ビゴー"],
    "ビアトリクス・ポター": ["ポター"],
    "アラン・ムーア": ["ムーア"],
    "エメリヤーエンコ・ヒョードル": ["ヒョードル"],
    "グスターヴ・ホルスト": ["ホルスト"],
    "トーベ・ヤンソン": ["ヤンソン"],
    "ボビー・ロブソン": ["ロブソン"],
    "ロバート・オッペンハイマー": ["オッペンハイマー"],
    "ルイーザ・メイ・オルコット": ["オルコット"],
    "ヨハン・クライフ": ["クライフ"],
    "パウル・フォン・ヒンデンブルク": ["ヒンデンブルク"],
    "クラウス・フォン・シュタウフェンベルク": ["シュタウフェンベルク"],
    "エルヴィン・ロンメル": ["ロンメル"],
    "オットー・フォン・ビスマルク": ["ビスマルク"],
    "カール・ボッシュ": ["ボッシュ"],
    "チャールズ・チャップリン": ["チャップリン"],
    "フランツ・カフカ": ["カフカ"],
}


# 短くすると問題文に答えが出てしまう問題の直し（現在の答え → (直す部分, 直した後)）
QUESTION_FIXES: dict[str, tuple[str, str]] = {
    "エメリヤーエンコ・ヒョードル": ("多くの王座を持つチーム・ヒョードルの主宰者は誰？", "多くの王座を持つ人物は誰？"),
}


def fixed_question(full: str, question: str) -> str:
    """答えが出てしまう問題文を直す。想定の文が無ければ黙って進めずに止める"""
    if full not in QUESTION_FIXES:
        return question
    old, new = QUESTION_FIXES[full]
    if old not in question:
        sys.exit(f"直す部分が問題文に見つからないので中止します: {full}")
    return question.replace(old, new)


def merge_aliases(current: list[str] | None, additions: list[str], answer: str = "") -> list[str]:
    """既存の別解を残したまま、まだ無いものだけを後ろに足す（新しい答えと同じものは入れない）"""
    merged = [a for a in (current or []) if a != answer]
    for alias in additions:
        if alias != answer and alias not in merged:
            merged.append(alias)
    return merged


def main() -> None:
    apply_to = sys.argv[sys.argv.index("--apply") + 1] if "--apply" in sys.argv else None
    key = _secret_key()
    rows = _request("quizzes?select=id,question,answer,accepted_answers", key)
    by_answer = {r["answer"]: r for r in rows}

    changes = []
    for full, (short, *extras) in SHORT_NAMES.items():
        row = by_answer.get(full)
        if row is None:
            if short not in by_answer:
                sys.exit(f"DBに見つからない答えがあるので中止します: {full}")
            continue  # 短縮済み
        if short in by_answer and short not in SHORT_NAMES:
            sys.exit(f"短くすると既存の答えと重複するので中止します: {short}")
        question = fixed_question(full, row["question"])
        if short in question:
            sys.exit(f"問題文に答えが出ているので中止します: {short}")
        changes.append((row, short, question, merge_aliases(row["accepted_answers"], [full, *extras], short)))
        print(f"{full} → {short}" + ("（問題文も修正）" if question != row["question"] else ""))
    print(f"\n変更あり {len(changes)} 問")

    if not apply_to:
        print("（表示のみ。書き込むには --apply BACKUP.json）")
        return

    Path(apply_to).write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print(f"バックアップ: {apply_to}（{len(rows)} 行）")
    for row, short, question, merged in changes:
        _request(f"quizzes?id=eq.{quote(row['id'])}", key, method="PATCH",
                 body={"answer": short, "question": question, "accepted_answers": merged},
                 extra_headers={"Prefer": "return=minimal"})
    print(f"✅ {len(changes)} 問を更新しました")


if __name__ == "__main__":
    main()
