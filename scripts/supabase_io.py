"""
Supabase への読み書き（標準ライブラリのみ）。

キーの使い分け:
  読み取り  … NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（ブラウザにも配られる公開キー）
  書き込み  … SUPABASE_SECRET_KEY（RLSを迂回する管理者キー。サーバ側専用）

SUPABASE_SECRET_KEY には NEXT_PUBLIC_ を付けないこと。
付けるとNext.jsがブラウザに埋め込んでしまい、誰でもDBを書き換えられるようになる。
"""
import json
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env.local"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if not ENV_FILE.exists():
        raise FileNotFoundError(f"{ENV_FILE} がありません")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _request(path: str, key: str, method: str = "GET", body=None, extra_headers=None):
    env = load_env()
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        **(extra_headers or {}),
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def _publishable_key() -> str:
    return load_env()["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def _secret_key() -> str:
    env = load_env()
    key = env.get("SUPABASE_SECRET_KEY")
    if not key:
        raise RuntimeError(
            ".env.local に SUPABASE_SECRET_KEY がありません。\n"
            "  Supabase ダッシュボード → Project Settings → API Keys の\n"
            "  Secret key（sb_secret_... ）を、NEXT_PUBLIC_ を付けずに追記してください。"
        )
    return key


def fetch_existing_answers() -> set[str]:
    """既存問題の答え一覧（重複チェック用）。読み取りなので公開キーで足りる"""
    rows = _request("quizzes?select=answer", _publishable_key())
    return {r["answer"] for r in rows}


def insert_quizzes(items: list[dict]) -> int:
    """
    候補をDBへ投入する。items は generate_quiz.py が作る形式。
    reading は accepted_answers の別解として入れる（答え合わせで読みを許容するため）。
    """
    if not items:
        return 0
    payload = [
        {
            "question": it["question"],
            "answer": it["answer"],
            "accepted_answers": [it["reading"]] if it.get("reading") else [],
        }
        for it in items
    ]
    _request("quizzes", _secret_key(), method="POST", body=payload,
             extra_headers={"Prefer": "return=minimal"})
    return len(payload)


if __name__ == "__main__":
    answers = fetch_existing_answers()
    print(f"DBの既存問題: {len(answers)} 問")
    try:
        _secret_key()
        print("SUPABASE_SECRET_KEY: ✅ 設定済み（投入できます）")
    except RuntimeError as e:
        print(f"SUPABASE_SECRET_KEY: ❌ 未設定\n{e}")
