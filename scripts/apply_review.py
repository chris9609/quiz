"""
Claude のレビュー結果を data/candidates.json に書き戻す。

夜間バッチでは `claude -p` にレビューさせるが、候補ファイルを Claude に直接編集させると
無人実行時に壊れるリスクがある。そこで Claude には判定 JSON だけを出させ、
書き戻しはこのスクリプトが決定的に行う。

入力の契約（Claude 側のプロンプトはこれに合わせる）:
  [{"answer": "ライスシャワー", "status": "approved", "reason": "有名競走馬。…",
    "question": "（任意）言い回しを手直しした問題文"}, ...]
  - answer は候補の answer と完全一致（strip のみ。曖昧マッチはしない）
  - status は approved / rejected のどちらか
  - reason は必須（review_reason として残す）
  - question は任意。approved のときだけ有効で、候補の問題文を置き換える。
    手直し後の文も generate_quiz.validate() のルール（文字数・答えの露出・1文・疑問形）を
    通らなければ拒否する。元の文は original_question に残す

受け付ける入力の形:
  - 素の JSON 配列
  - ```json … ``` で囲まれた配列
  - `claude -p --output-format json` の封筒（{"result": "..."} の中に配列）

ルール:
  - 対象は status=pending の候補だけ。imported を approved に戻すと import_approved.py が
    二重投入するので、pending 以外を指す判定は拒否する
  - 1件でも不正があれば何も書かずに終了コード 1（全か無か）
  - JSON に含まれない pending は pending のまま残す（次回また出る）

使い方:
  claude -p "..." | python3 scripts/apply_review.py            # stdin から
  python3 scripts/apply_review.py review.json                   # ファイルから
  python3 scripts/apply_review.py --dry-run < review.json       # 書かずに予定を表示
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_quiz import validate  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CANDIDATES_FILE = BASE_DIR / "data" / "candidates.json"

VALID_STATUSES = {"approved", "rejected"}
REVIEWER = "claude"


def parse_reviews(raw: str) -> list:
    """claude -p の出力からレビュー配列を取り出す。取り出せなければ ValueError"""
    text = raw.strip()
    if not text:
        raise ValueError("入力が空です")

    # --output-format json の封筒。result の中身が本体
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        obj = None
    if isinstance(obj, dict) and isinstance(obj.get("result"), str):
        text = obj["result"].strip()
        obj = None
    elif isinstance(obj, list):
        return obj

    # ```json ... ``` のフェンス
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()

    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON として読めません: {e}") from e
    if not isinstance(obj, list):
        raise ValueError("JSON 配列ではありません")
    return obj


def apply_reviews(items: list[dict], reviews: list) -> tuple[list[dict], list[str]]:
    """
    候補一覧に判定を当てる。(新しい候補一覧, エラー一覧) を返す。
    エラーが1件でもあれば候補一覧は元のまま（呼び出し側は書かないこと）。
    """
    errors: list[str] = []
    pending_by_answer: dict[str, list[int]] = {}
    non_pending: dict[str, str] = {}
    for i, it in enumerate(items):
        if it.get("status") == "pending":
            pending_by_answer.setdefault(it["answer"], []).append(i)
        else:
            non_pending[it["answer"]] = it.get("status", "?")

    updates: dict[int, tuple[str, str, str | None]] = {}
    seen: set[str] = set()
    for n, rv in enumerate(reviews, 1):
        if not isinstance(rv, dict):
            errors.append(f"{n}件目: オブジェクトではありません")
            continue
        answer = str(rv.get("answer", "")).strip()
        status = str(rv.get("status", "")).strip()
        reason = str(rv.get("reason", "")).strip()
        question = str(rv.get("question") or "").strip() or None
        if not answer:
            errors.append(f"{n}件目: answer がありません")
            continue
        if answer in seen:
            errors.append(f"[{answer}] 判定が重複しています")
            continue
        seen.add(answer)
        if status not in VALID_STATUSES:
            errors.append(f"[{answer}] status が不正です: {status!r}（approved / rejected のみ）")
        if not reason:
            errors.append(f"[{answer}] reason がありません")
        idxs = pending_by_answer.get(answer, [])
        if len(idxs) == 0:
            if answer in non_pending:
                errors.append(f"[{answer}] は pending ではありません（現在 {non_pending[answer]}）")
            else:
                errors.append(f"[{answer}] に一致する候補がありません")
            continue
        if len(idxs) > 1:
            errors.append(f"[{answer}] pending の候補が {len(idxs)} 件あり、一意に決まりません")
            continue
        if question is not None and status == "approved":
            if question == items[idxs[0]]["question"]:
                question = None  # 変更なしなら手直し扱いにしない
            else:
                # 手直し後も機械チェックは通す。答えの重複は元の候補で済んでいるので見ない
                why = validate({**items[idxs[0]], "question": question}, answer, set())
                if why:
                    errors.append(f"[{answer}] 手直しした問題文が不正です: {why}")
        updates[idxs[0]] = (status, reason, question)

    if errors:
        return items, errors

    new_items = [dict(it) for it in items]
    for i, (status, reason, question) in updates.items():
        new_items[i]["status"] = status
        new_items[i]["review_reason"] = reason
        new_items[i]["reviewed_by"] = REVIEWER
        if question is not None and status == "approved":
            new_items[i]["original_question"] = new_items[i]["question"]
            new_items[i]["question"] = question
    return new_items, []


def save(items: list[dict]) -> None:
    # 書きかけで落ちて候補ファイルが壊れないよう、同じディレクトリに書いてから置き換える。
    # 直列化は review_candidates.py と揃える（差分が触った行だけになるように）
    tmp = CANDIDATES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    os.replace(tmp, CANDIDATES_FILE)


def main() -> None:
    # cron のログに逐次出るようにする（バッファされると進捗が見えない）
    sys.stdout.reconfigure(line_buffering=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv

    raw = Path(args[0]).read_text() if args else sys.stdin.read()
    try:
        reviews = parse_reviews(raw)
    except ValueError as e:
        print(f"❌ レビュー結果を読めませんでした: {e}")
        print("--- 受け取った入力 ---")
        print(raw)
        sys.exit(1)

    if not CANDIDATES_FILE.exists():
        print("候補ファイルがありません")
        sys.exit(1)
    items = json.loads(CANDIDATES_FILE.read_text())

    new_items, errors = apply_reviews(items, reviews)
    if errors:
        print(f"❌ 不正な判定が {len(errors)} 件。何も書き込みません")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    changed = [(old, new) for old, new in zip(items, new_items) if old["status"] != new["status"]]
    for old, new in changed:
        mark = "✓" if new["status"] == "approved" else "✗"
        print(f"{mark} [{new['answer']}] pending → {new['status']}: {new['review_reason']}")
        if old["question"] != new["question"]:
            print(f"    問題文を手直し:\n      旧: {old['question']}\n      新: {new['question']}")
    still_pending = sum(1 for it in new_items if it["status"] == "pending")
    if still_pending:
        print(f"（判定なしで pending のまま: {still_pending} 件）")

    if not changed:
        print("反映する判定がありません")
        return
    if dry_run:
        print(f"[dry-run] {len(changed)} 件を書き込む予定（未書き込み）")
        return

    save(new_items)
    approved = sum(1 for it in new_items if it["status"] == "approved")
    print(f"保存しました。採用済み（未投入）: {approved} 件")
    if approved:
        print("→ python3 scripts/import_approved.py で DB に入れます")


if __name__ == "__main__":
    main()
