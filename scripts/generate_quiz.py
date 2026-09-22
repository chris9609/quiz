"""
ローカルLLM（Ollama）で早押しクイズの候補を作り、data/candidates.json に貯める。

設計の要点:
  LLM に知識を出させると事実がでたらめになる（実測: 5問中4問が誤り）。
  そこで Wikipedia の本文を渡し、「資料に書いてあることだけで問題文を組み立てる」
  変換タスクに徹させる。これで事実の正確さは資料に担保される。

  生成物は自動でDBに入れない。candidates.json に貯めて、人が採否を決める。

使い方:
  python3 scripts/generate_quiz.py 10      # 10問ぶん候補を作る
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wikipedia_source import pick_articles  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CANDIDATES_FILE = BASE_DIR / "data" / "candidates.json"

OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "gemma4:e4b"

# 既存34問はおおむね 60〜120 文字。実測で長すぎる問題文が出たので上下を切る
MIN_QUESTION_CHARS = 45
MAX_QUESTION_CHARS = 150
# 「江戸城跡のヒカリゴケ生育地」のような天然記念物の記事名は、
# 良質な記事に多いが答えとして誰も言えない。作問前に弾く。
UNANSWERABLE_TITLE_SUFFIXES = ("生育地", "自生地", "生息地", "繁殖地", "群落", "遺跡", "古墳群")

PROMPT = """あなたは競技クイズの作問者です。
以下の【資料】だけを根拠に、早押しクイズを1問作ってください。
資料に書かれていないことは絶対に書かないでください。推測も禁止です。

【形式】
答えを特定できる情報を前振りとして述べてから、最後に問う形にします。
前振りは60〜100文字程度。問題文の中に答えそのものを書いてはいけません。

<良い例>
問題文: 木材に耳を当てて遊ぶ子どもたちを見たフランスの医師が原型を発明した、病院での診察で使われる器具は何？
答え: 聴診器

<悪い例>
問題文: 日本で一番高い山は何ですか？   ← 前振りが無く、ただの質問になっている

【答え】
答えは必ず「{title}」です。この語が答えになるように問題文を作ってください。
reading には「{title}」の読みを**ひらがなだけ**で書いてください（漢字が無ければ空文字）。

【資料】
{extract}

JSON1件だけを出力してください。説明・前置き・コードブロックは不要です。
{{"question":"...","answer":"{title}","reading":"..."}}
"""


def ollama_generate(prompt: str) -> str:
    payload = {
        "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
        "options": {"temperature": 0.7},
    }
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["response"]


def parse_json_block(raw: str) -> dict | None:
    """```json ...``` で囲まれて返ることがあるので、最初のJSONオブジェクトを取り出す"""
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def validate(item: dict, title: str, known_answers: set[str]) -> str | None:
    """採用できない理由を返す。問題なければ None"""
    q = (item.get("question") or "").strip()
    a = (item.get("answer") or "").strip()
    r = (item.get("reading") or "").strip()

    if not q or not a:
        return "question か answer が空"
    if title.endswith(UNANSWERABLE_TITLE_SUFFIXES):
        return "答えが天然記念物・遺跡の名称で早押しに向かない"
    if a != title:
        return f"答えが指定と違う（{a!r} != {title!r}）"
    if len(q) < MIN_QUESTION_CHARS:
        return f"問題文が短すぎる（{len(q)}文字）"
    if len(q) > MAX_QUESTION_CHARS:
        return f"問題文が長すぎる（{len(q)}文字）"
    if a in q:
        return "問題文に答えが露出している"
    if a in known_answers:
        return "既存の問題と答えが重複"
    if not q.rstrip().endswith(("？", "?")):
        return "問題文が疑問形で終わっていない"
    # 早押しクイズは1文が原則。途中に句点があると
    # 「彼女は〜しました。この論争の中心人物は誰でしょうか？」のような多文構成になる
    if "。" in q.rstrip("。"):
        return "問題文が複数の文に分かれている"

    # 読みが要るのは答えに漢字が含まれるときだけ。
    # カタカナ・ひらがなの表記ゆれは answerCheck.ts の正規化が吸収するので読みは不要。
    has_kanji = re.search(r"[一-龥]", a) is not None
    if has_kanji and not r:
        return "漢字の答えなのに reading が空"
    # 「ポジャールスキー公 → ポジャールスキーこう」のようにカタカナ混じりが自然な答えがある。
    # カナ⇔かなの差は answerCheck.ts の正規化が吸収するので、ここでは仮名であれば通す。
    if has_kanji and not re.fullmatch(r"[ぁ-ゖァ-ヶー0-9A-Za-z\s]+", r):
        return f"reading が仮名でない（{r!r}）"
    return None


def load_known_answers() -> set[str]:
    """DBの既存問題＋候補ファイルの答えを集めて重複を避ける"""
    answers: set[str] = set()
    if CANDIDATES_FILE.exists():
        answers |= {c["answer"] for c in json.loads(CANDIDATES_FILE.read_text())}
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from supabase_io import fetch_existing_answers
        answers |= fetch_existing_answers()
    except Exception as e:
        print(f"  （DBの既存問題を取得できず、候補ファイルだけで重複判定します: {e}）")
    return answers


def main() -> None:
    # cron のログに逐次出るようにする（バッファされると進捗が見えない）
    sys.stdout.reconfigure(line_buffering=True)
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    known = load_known_answers()
    print(f"重複チェック対象: {len(known)} 問")

    # 歩留まりを見込んで多めに記事を取る
    articles = pick_articles(int(want * 1.8) + 3, exclude=known)
    print(f"記事を {len(articles)} 件取得。生成を開始します\n")

    accepted, rejected = [], []
    for art in articles:
        if len(accepted) >= want:
            break
        raw = ollama_generate(PROMPT.format(title=art["title"], extract=art["extract"][:1500]))
        item = parse_json_block(raw)
        if item is None:
            rejected.append((art["title"], "JSONとして読めない"))
            print(f"  ✗ {art['title']}: JSONとして読めない")
            continue

        reason = validate(item, art["title"], known)
        if reason:
            rejected.append((art["title"], reason))
            print(f"  ✗ {art['title']}: {reason}")
            continue

        accepted.append({
            "question": item["question"].strip(),
            "answer": item["answer"].strip(),
            "reading": (item.get("reading") or "").strip(),
            "source_title": art["title"],
            "source_url": art["url"],
            "model": OLLAMA_MODEL,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "status": "pending",
        })
        known.add(item["answer"].strip())
        print(f"  ✓ {art['title']}")

    existing = json.loads(CANDIDATES_FILE.read_text()) if CANDIDATES_FILE.exists() else []
    CANDIDATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CANDIDATES_FILE.write_text(json.dumps(existing + accepted, ensure_ascii=False, indent=2))

    total = len(accepted) + len(rejected)
    rate = f"{len(accepted)}/{total}" if total else "0/0"
    print(f"\n採用 {len(accepted)} 問 / 生成 {total} 問（歩留まり {rate}）")
    print(f"→ {CANDIDATES_FILE}")


if __name__ == "__main__":
    main()
