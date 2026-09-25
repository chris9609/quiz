"""
アプリの「+ Anki」で記録された問題を、AnkiConnect 経由で Anki に入れる（Mac 上で実行）。

アプリ（デプロイ先）からは localhost の AnkiConnect に届かないので、
アプリは Supabase の anki_requests に記録するだけにして、ここで拾って投入する。
入れ終わった記録には added_at を付け、次回から拾わない。

Anki が起動していなければ何もせず正常終了する（次回の実行で拾う）。

使い方:
  python3 scripts/export_anki.py
"""
import html
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_io import fetch_pending_anki_requests, mark_anki_added  # noqa: E402

ANKI_CONNECT_URL = "http://127.0.0.1:8765"
DECK = "クイズ::早押しアプリ"
TAG = "早押しアプリ"
# 日本語版 Anki の標準ノートタイプは「基本」、英語版は「Basic」
BASIC_MODELS = ("基本", "Basic")


class AnkiUnavailable(Exception):
    """Anki（AnkiConnect）が起動していない"""


def anki_invoke(action: str, **params):
    body = json.dumps({"action": action, "version": 6, "params": params}).encode()
    req = urllib.request.Request(ANKI_CONNECT_URL, data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
    except (urllib.error.URLError, ConnectionError) as e:
        raise AnkiUnavailable(str(e)) from e
    if data.get("error"):
        raise RuntimeError(f"AnkiConnect エラー（{action}）: {data['error']}")
    return data["result"]


def format_back(answer: str, accepted_answers: list[str] | None) -> str:
    """裏面: 答え（別解）。Anki のフィールドは HTML なのでエスケープする"""
    others = [a for a in (accepted_answers or []) if a and a != answer]
    text = f"{answer}（{'／'.join(others)}）" if others else answer
    return html.escape(text)


def build_note(quiz: dict, model: str, fields: list[str]) -> dict:
    return {
        "deckName": DECK,
        "modelName": model,
        "fields": {
            fields[0]: html.escape(quiz["question"]),
            fields[1]: format_back(quiz["answer"], quiz.get("accepted_answers")),
        },
        "tags": [TAG],
        "options": {"allowDuplicate": False},
    }


def is_duplicate_error(e: Exception) -> bool:
    """同じ表面のカードが既にある。前回 Anki には入ったが added_at の記録前に落ちた場合など"""
    return "duplicate" in str(e)


def resolve_basic_model() -> tuple[str, list[str]]:
    models = anki_invoke("modelNames")
    model = next((m for m in BASIC_MODELS if m in models), None)
    if model is None:
        raise RuntimeError(f"標準ノートタイプ（基本/Basic）がありません: {models}")
    # フィールド名も日英で違う（表面/裏面 vs Front/Back）ので実際の定義から取る
    return model, anki_invoke("modelFieldNames", modelName=model)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    requests = fetch_pending_anki_requests()
    print(f"Anki 未投入の記録: {len(requests)} 件")
    if not requests:
        return

    try:
        model, fields = resolve_basic_model()
        anki_invoke("createDeck", deck=DECK)  # 既にあれば何もしない
    except AnkiUnavailable:
        print("Anki が起動していないためスキップ（次回に持ち越し）")
        return

    added = 0
    for req in requests:
        quiz = req["quizzes"]
        try:
            anki_invoke("addNote", note=build_note(quiz, model, fields))
            print(f"  追加: {quiz['answer']}")
        except RuntimeError as e:
            if not is_duplicate_error(e):
                raise
            print(f"  既に Anki にあり: {quiz['answer']}")
        mark_anki_added(req["id"])
        added += 1
    print(f"完了: {added} 件（デッキ: {DECK}）")


if __name__ == "__main__":
    main()
