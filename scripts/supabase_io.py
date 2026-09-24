"""
Supabase への読み書き（標準ライブラリのみ）。

キーは読み書きとも SUPABASE_SECRET_KEY（RLSを迂回する管理者キー。サーバ側専用）。
quizzes の読み取りは RLS で「ログイン済みのみ」にしてあり、公開キーで読むと
エラーにならず空配列が返る（＝重複チェックが黙って素通りになる）ので、読み取りにも公開キーは使わない。

SUPABASE_SECRET_KEY には NEXT_PUBLIC_ を付けないこと。
付けるとNext.jsがブラウザに埋め込んでしまい、誰でもDBを書き換えられるようになる。

SUPABASE_SECRET_KEY はこのリポジトリには置かず、他プロジェクト（shogi-analyzer 等）と同じく
`~/claude/application/MCP/.env` のものを借りる。
"""
import json
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env.local"
MCP_ENV_FILE = Path.home() / "claude/application/MCP/.env"


def _parse_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        raise FileNotFoundError(f"{ENV_FILE} がありません")
    return _parse_env(ENV_FILE)


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


def _secret_key() -> str:
    if not MCP_ENV_FILE.exists():
        raise RuntimeError(f"{MCP_ENV_FILE} がありません")
    mcp = _parse_env(MCP_ENV_FILE)
    # 別プロジェクトの鍵を誤って使わないよう、URL が一致するときだけ借りる
    if mcp.get("SUPABASE_URL", "").rstrip("/") != load_env()["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"):
        raise RuntimeError(
            f"{MCP_ENV_FILE} の SUPABASE_URL がこのプロジェクトの NEXT_PUBLIC_SUPABASE_URL と一致しません"
        )
    key = mcp.get("SUPABASE_SECRET_KEY")
    if not key:
        raise RuntimeError(f"{MCP_ENV_FILE} に SUPABASE_SECRET_KEY がありません")
    return key


def fetch_existing_answers() -> set[str]:
    """既存問題の答え一覧（重複チェック用）"""
    rows = _request("quizzes?select=answer", _secret_key())
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
