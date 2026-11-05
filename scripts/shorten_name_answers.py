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
    "サタジット・レイ": ["レイ"],
    "クラウス・フォン・シュタウフェンベルク": ["シュタウフェンベルク"],
    "エルヴィン・ロンメル": ["ロンメル"],
    "オットー・フォン・ビスマルク": ["ビスマルク"],
    "カール・ボッシュ": ["ボッシュ"],
    "チャールズ・チャップリン": ["チャップリン"],
    "フランツ・カフカ": ["カフカ"],
}


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
        changes.append((row, short, merge_aliases(row["accepted_answers"], [full, *extras], short)))
        leak = "  ⚠ 問題文に答えが出ている" if short in row["question"] else ""
        print(f"{full} → {short}{leak}")
    print(f"\n変更あり {len(changes)} 問")

    if not apply_to:
        print("（表示のみ。書き込むには --apply BACKUP.json）")
        return

    Path(apply_to).write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print(f"バックアップ: {apply_to}（{len(rows)} 行）")
    for row, short, merged in changes:
        _request(f"quizzes?id=eq.{quote(row['id'])}", key, method="PATCH",
                 body={"answer": short, "accepted_answers": merged},
                 extra_headers={"Prefer": "return=minimal"})
    print(f"✅ {len(changes)} 問を更新しました")


if __name__ == "__main__":
    main()
