"""
レビューで採用した候補を Supabase に投入する。

投入には SUPABASE_SECRET_KEY が必要（RLS で匿名の書き込みを塞いでいるため）。
投入した候補は status を imported に変え、二重投入を防ぐ。

使い方:
  python3 scripts/import_approved.py           # 確認してから投入
  python3 scripts/import_approved.py --yes     # 確認なしで投入（cron 用）
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_io import fetch_existing_answers, insert_quizzes  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CANDIDATES_FILE = BASE_DIR / "data" / "candidates.json"


def main() -> None:
    # cron のログに逐次出るようにする（バッファされると進捗が見えない）
    sys.stdout.reconfigure(line_buffering=True)
    # 投入対象の有無にかかわらず必ずDBを読む。
    # Supabase の無料プランは7日間クエリが無いと一時停止されるため、
    # この日次実行がそのまま keepalive を兼ねる。
    existing = fetch_existing_answers()
    print(f"DBの現在の問題数: {len(existing)} 問")

    if not CANDIDATES_FILE.exists():
        print("候補ファイルがありません")
        return
    items = json.loads(CANDIDATES_FILE.read_text())
    targets = [it for it in items if it["status"] == "approved"]

    if not targets:
        print("投入対象（status=approved）がありません")
        return

    print(f"投入対象: {len(targets)} 問")
    for it in targets:
        print(f"  [{it['answer']}] {it['question'][:45]}...")

    if "--yes" not in sys.argv:
        try:
            if input("\n投入しますか？ [y/N] > ").strip().lower() != "y":
                print("中止しました")
                return
        except (EOFError, KeyboardInterrupt):
            print("\n中止しました")
            return

    count = insert_quizzes(targets)
    for it in targets:
        it["status"] = "imported"
    CANDIDATES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    print(f"✅ {count} 問を投入しました")


if __name__ == "__main__":
    main()
