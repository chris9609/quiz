"""
pending の候補を Claude にレビューさせ、判定を data/candidates.json に書き戻す。

  1. build_prompt()  採否基準（review_rubric.md）+ pending 候補 + 各候補の Wikipedia 導入部を
                     1つのプロンプトに組む
  2. run_claude()    claude -p をツールなし（--tools ""）で呼び、判定 JSON だけを返させる
  3. apply_reviews() 判定を検証して書き戻す。1件でも不正なら何も書かない

Claude に材料を全部渡してツールを持たせないのは、無人実行で候補ファイルや DB を
触られる余地を無くすため。裏取り用の出典本文も生成時と同じ Wikipedia 導入部を渡す。
書き戻しを Claude にさせず Python で決定的にやるのも同じ理由。

API 課金ではなくサブスク枠（OAuth）で動かすため --bare は付けない
（--bare は ANTHROPIC_API_KEY しか読まない）。

判定 JSON の契約（プロンプトの HEADER と parse/apply を揃えること）:
  [{"answer": "候補の answer と完全一致", "status": "approved|rejected", "reason": "必須",
    "question": "（任意）言い回しを手直しした問題文"}]
  - question は approved のときだけ有効。generate_quiz.validate() を通らなければ拒否。
    元の文は original_question に残す
  - 対象は status=pending の候補だけ。imported を approved に戻すと import_approved.py が
    二重投入するので拒否する
  - 判定に含まれない pending は pending のまま残す（次回また出る）
  - 出典が取れなかった候補はプロンプトに入れず pending のまま残す
    （一時的なネットワーク障害が「確認できない＝見送り」で良い候補を殺さないように）

使い方:
  python3 scripts/review_with_claude.py               # レビューして書き戻す
  python3 scripts/review_with_claude.py --dry-run     # claude は呼ぶが書き戻さない
  python3 scripts/review_with_claude.py --apply X.json  # 保存済みの claude 出力を書き戻す（claude は呼ばない）
  python3 scripts/review_with_claude.py --list        # 候補の状態一覧
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_quiz import MAX_QUESTION_CHARS, MIN_QUESTION_CHARS, validate  # noqa: E402
from wikipedia_source import fetch_extract  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CANDIDATES_FILE = BASE_DIR / "data" / "candidates.json"
RUBRIC_FILE = BASE_DIR / "scripts" / "review_rubric.md"
# claude -p に渡したプロンプトと返答を残す場所。失敗したとき何を渡して何が返ったか見られるように
WORK_DIR = Path(tempfile.gettempdir()) / "quiz_review"

CLAUDE_BIN = os.environ.get("CLAUDE_BIN", str(Path.home() / ".local/bin/claude"))
VALID_STATUSES = {"approved", "rejected"}
REVIEWER = "claude"

HEADER = """あなたは早押しクイズの候補問題をレビューする担当です。
以下の「採否基準」に従って、各候補を approved / rejected に振り分けてください。
候補ごとに出典（Wikipedia 導入部）を付けてあるので、問題文の固有名詞・数字・年・関係性を一つずつ出典と照合してから判定してください。
「有名だから合っているだろう」で通さないでください。
出典本文はこのプロンプトに含まれています。ツールは使えないので、採否基準に書かれた `fetch_extract` の呼び出しは不要です。
渡された本文だけで照合してください（本文に書かれていないことは「確認できない」として扱います）。

# 採否基準

{rubric}

# 出力形式

**JSON 配列だけを出力してください。** 前置き・説明・見出しは一切書かないでください。
配列の要素は候補ごとに1つ、次の形です:

```json
[
  {{"answer": "候補の answer をそのままコピー", "status": "approved または rejected", "reason": "判定理由（照合した根拠を含める）", "question": "（任意）手直しした問題文"}}
]
```

- `answer` は下の候補一覧の answer を**一文字も変えずに**コピーしてください（記号・空白も含めて完全一致で照合します）。
- `status` は `approved` か `rejected` のどちらかだけ。
- `reason` は必須。approved なら「〜は出典と一致」のように照合した根拠を、rejected なら見送り理由を書いてください。
- `question` は言い回しを手直しするときだけ付けてください。手直ししないなら省略します。
  手直し後の文は機械チェックにかかるので、次を必ず守ってください:
  - {min_chars}〜{max_chars} 文字
  - 1文だけ（途中に「。」を入れない）
  - 「？」で終わる
  - 問題文の中に answer の文字列を含めない
  - 出典にない事実を足さない。答えは変えない
- 判定できない候補があれば、その候補は配列に入れないでください（pending のまま次回に回ります）。

# 候補（{count} 件）
"""

CANDIDATE = """
## 候補 {n}
- answer: {answer}
- reading: {reading}
- question: {question}
- 出典: {source_url}

### 出典本文（Wikipedia「{source_title}」導入部）
{extract}
"""


# ---------------------------------------------------------------- 1. プロンプト

def build_prompt(items: list[dict], get_extract=fetch_extract) -> tuple[str, list[str]]:
    """
    pending 候補からプロンプトを組む。(プロンプト, 出典が取れず除外した answer 一覧) を返す。
    載せる候補が 0 件なら プロンプトは ""。
    """
    pending = [it for it in items if it.get("status") == "pending"]
    blocks: list[str] = []
    skipped: list[str] = []
    for it in pending:
        try:
            extract = get_extract(it["source_title"]).strip()
        except Exception as e:  # ネットワーク障害など。候補は pending のまま残す
            print(f"  （出典を取得できず今回は見送り: [{it['answer']}] {e}）")
            skipped.append(it["answer"])
            continue
        if not extract:
            print(f"  （出典が空のため今回は見送り: [{it['answer']}]）")
            skipped.append(it["answer"])
            continue
        blocks.append(CANDIDATE.format(
            n=len(blocks) + 1,
            answer=it["answer"],
            reading=it.get("reading") or "なし",
            question=it["question"],
            source_url=it["source_url"],
            source_title=it["source_title"],
            extract=extract,
        ))
    if not blocks:
        return "", skipped
    header = HEADER.format(rubric=RUBRIC_FILE.read_text().strip(),
                           min_chars=MIN_QUESTION_CHARS, max_chars=MAX_QUESTION_CHARS,
                           count=len(blocks))
    return header + "".join(blocks), skipped


# ---------------------------------------------------------------- 2. claude -p

def run_claude(prompt: str) -> str:
    """claude -p をツールなしで呼び、標準出力（--output-format json の封筒）を返す"""
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prompt_file = WORK_DIR / f"prompt_{stamp}.md"
    result_file = WORK_DIR / f"prompt_{stamp}.result.json"
    prompt_file.write_text(prompt)
    print(f"claude -p でレビュー中... （プロンプト: {prompt_file}）")
    proc = subprocess.run(
        [CLAUDE_BIN, "-p", "--tools", "", "--output-format", "json", "--no-session-persistence"],
        input=prompt, capture_output=True, text=True,
    )
    result_file.write_text(proc.stdout)
    if proc.returncode != 0:
        raise RuntimeError(f"claude -p が失敗しました（exit {proc.returncode}）\n{proc.stderr}")
    return proc.stdout


def parse_reviews(raw: str) -> list:
    """
    claude -p の出力から判定配列を取り出す。取り出せなければ ValueError。
    受け付ける形: --output-format json の封筒 / 素の配列 / ```json``` フェンス / 前置き付きの配列。
    読み取りは寛容に、検証（apply_reviews）は厳格に、の分担。
    """
    text = raw.strip()
    if not text:
        raise ValueError("入力が空です")

    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        obj = None
    if isinstance(obj, dict) and isinstance(obj.get("result"), str):
        text = obj["result"].strip()
        obj = None
    elif isinstance(obj, list):
        return obj

    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end <= start:
            raise ValueError(f"JSON として読めません: {e}") from e
        try:
            obj = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            raise ValueError(f"JSON として読めません: {e}") from e
    if not isinstance(obj, list):
        raise ValueError("JSON 配列ではありません")
    return obj


# ---------------------------------------------------------------- 3. 書き戻し

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
    # 直列化は generate_quiz.py と揃える（差分が触った行だけになるように）
    tmp = CANDIDATES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2))
    os.replace(tmp, CANDIDATES_FILE)


# ---------------------------------------------------------------- main

def show_list(items: list[dict]) -> None:
    counts: dict[str, int] = {}
    for it in items:
        counts[it["status"]] = counts.get(it["status"], 0) + 1
    print(f"候補 {len(items)} 件: " + " / ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    for i, it in enumerate(items, 1):
        mark = {"pending": "・", "approved": "✓", "rejected": "✗", "imported": "済"}.get(it["status"], "?")
        print(f"{mark} {i:>3}. [{it['answer']}] {it['question'][:50]}...")


def main() -> None:
    # cron のログに逐次出るようにする（バッファされると進捗が見えない）
    sys.stdout.reconfigure(line_buffering=True)
    dry_run = "--dry-run" in sys.argv
    apply_file = sys.argv[sys.argv.index("--apply") + 1] if "--apply" in sys.argv else None

    if not CANDIDATES_FILE.exists():
        print("候補ファイルがありません。先に generate_quiz.py を実行してください")
        return
    items = json.loads(CANDIDATES_FILE.read_text())
    if "--list" in sys.argv:
        show_list(items)
        return

    if apply_file:
        raw = Path(apply_file).read_text()
    else:
        prompt, skipped = build_prompt(items)
        if not prompt:
            print("レビュー待ちの候補はありません。claude は呼びません")
            return
        pending = sum(1 for it in items if it.get("status") == "pending")
        print(f"レビュー対象: {pending - len(skipped)} 件（出典取得失敗で除外: {len(skipped)} 件）")
        raw = run_claude(prompt)

    try:
        reviews = parse_reviews(raw)
    except ValueError as e:
        print(f"❌ レビュー結果を読めませんでした: {e}")
        print("--- 受け取った出力 ---")
        print(raw)
        sys.exit(1)

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
