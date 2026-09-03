"""
生成された候補を1問ずつ確認して、採用/見送りを決める。

LLM の作問は資料に基づいていても外すことがあるので、DB に入るのは
必ずここを通ったものだけにする。出典URLが付いているので、
怪しいと思ったらすぐ裏が取れる。

  y = 採用    n = 見送り    s = 保留（次回また出る）    q = 中断して保存

使い方:
  python3 scripts/review_candidates.py          # 未処理の候補をレビュー
  python3 scripts/review_candidates.py --list   # 一覧を見るだけ
"""
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CANDIDATES_FILE = BASE_DIR / "data" / "candidates.json"


def load() -> list[dict]:
    if not CANDIDATES_FILE.exists():
        print("候補がありません。先に generate_quiz.py を実行してください")
        sys.exit(0)
    return json.loads(CANDIDATES_FILE.read_text())


def save(items: list[dict]) -> None:
    CANDIDATES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2))


def show_list(items: list[dict]) -> None:
    counts: dict[str, int] = {}
    for it in items:
        counts[it["status"]] = counts.get(it["status"], 0) + 1
    print(f"候補 {len(items)} 件: " + " / ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    for i, it in enumerate(items, 1):
        mark = {"pending": "・", "approved": "✓", "rejected": "✗"}.get(it["status"], "?")
        print(f"{mark} {i:>3}. [{it['answer']}] {it['question'][:50]}...")


def main() -> None:
    # cron のログに逐次出るようにする（バッファされると進捗が見えない）
    sys.stdout.reconfigure(line_buffering=True)
    items = load()
    if "--list" in sys.argv:
        show_list(items)
        return

    pending = [it for it in items if it["status"] == "pending"]
    if not pending:
        print("レビュー待ちの候補はありません")
        approved = [it for it in items if it["status"] == "approved"]
        if approved:
            print(f"（採用済みで未投入が {len(approved)} 件あります → import_approved.py）")
        return

    print(f"レビュー待ち: {len(pending)} 問\n")
    for n, it in enumerate(pending, 1):
        print("=" * 70)
        print(f"[{n}/{len(pending)}]")
        print(f"問題: {it['question']}")
        print(f"答え: {it['answer']}　（読み: {it['reading'] or 'なし'}）")
        print(f"出典: {it['source_url']}")
        try:
            ans = input("採用する？ [y/n/s/q] > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\n中断しました")
            break
        if ans == "q":
            break
        if ans == "y":
            it["status"] = "approved"
        elif ans == "n":
            it["status"] = "rejected"
        # s とその他は pending のまま

    save(items)
    approved = sum(1 for it in items if it["status"] == "approved")
    print(f"\n保存しました。採用済み（未投入）: {approved} 件")
    if approved:
        print("→ python3 scripts/import_approved.py で DB に入れます")


if __name__ == "__main__":
    main()
