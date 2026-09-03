"""
Wikipedia「良質な記事」から、クイズの答えになる記事を選んで本文を取ってくる。

「良質な記事」は日本語版Wikipediaが品質を認定した約2,500件のカテゴリ。
人の目が入っているので、ランダム記事のような極端に短い項目や
未整備の項目が混じりにくい。
"""
import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_FILE = BASE_DIR / "data" / "wikipedia_titles.json"

# Wikipedia は連絡先入りの User-Agent を求める。無いと 429 を食らいやすい
USER_AGENT = "chris-quiz-app/1.0 (https://github.com/chris9609; zyou06979@gmail.com)"

# 資料が短い記事はクイズにならない（実測: 56文字の記事は定義の丸写しになった）
MIN_EXTRACT_CHARS = 150

# クイズの題材にしたくないもの
# 事件・事故はクイズの題材にしない。
# 括弧つきタイトル（例:「志津川 (南三陸町)」）は曖昧さ回避の注記であって答えの一部ではないので除く。
EXCLUDE_TITLE_PATTERN = re.compile(
    r"事件|殺人|事故|災害|虐殺|遭難|戦争犯罪|自殺"   # 題材にしたくないもの
    r"|一覧|年表|の登場人物|カテゴリ"                # 列挙記事。1つの答えに絞れない
    r"|\s\("                                        # 曖昧さ回避の注記。答えの一部ではない
)

REQUEST_INTERVAL_SEC = 2.0


def _get(url: str, tries: int = 5):
    """429/503 は待って再試行する"""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < tries - 1:
                time.sleep(15 * (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def fetch_titles(force: bool = False) -> list[str]:
    """
    「良質な記事」のタイトル一覧。約2,500件あり6リクエストかかるので
    ローカルにキャッシュする（週次で取り直す必要はない）。
    """
    if CACHE_FILE.exists() and not force:
        return json.loads(CACHE_FILE.read_text())

    titles: list[str] = []
    cont: dict[str, str] = {}
    while True:
        params = {
            "action": "query", "list": "categorymembers",
            "cmtitle": "Category:良質な記事", "cmlimit": "500",
            "cmnamespace": "0", "format": "json", **cont,
        }
        data = _get("https://ja.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        titles += [m["title"] for m in data["query"]["categorymembers"]]
        if "continue" not in data:
            break
        cont = data["continue"]
        time.sleep(REQUEST_INTERVAL_SEC)

    titles = [t for t in titles if not EXCLUDE_TITLE_PATTERN.search(t)]
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(titles, ensure_ascii=False, indent=1))
    return titles


def fetch_extract(title: str) -> str:
    """記事の導入部（プレーンテキスト）を取る。これが作問の唯一の根拠になる"""
    params = {
        "action": "query", "prop": "extracts", "exintro": "1",
        "explaintext": "1", "format": "json", "titles": title,
    }
    data = _get("https://ja.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    pages = data["query"]["pages"]
    return next(iter(pages.values())).get("extract", "").strip()


def article_url(title: str) -> str:
    return "https://ja.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))


def pick_articles(count: int, exclude: set[str] | None = None):
    """
    作問に使える記事を count 件返す。
    資料が短い記事はここで捨てる（LLM に渡す前に弾くのでAPIも節約になる）。
    """
    exclude = exclude or set()
    titles = [t for t in fetch_titles() if t not in exclude]
    random.shuffle(titles)

    picked = []
    for title in titles:
        if len(picked) >= count:
            break
        extract = fetch_extract(title)
        time.sleep(REQUEST_INTERVAL_SEC)
        if len(extract) < MIN_EXTRACT_CHARS:
            continue
        picked.append({"title": title, "extract": extract, "url": article_url(title)})
    return picked


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"「良質な記事」総数（除外後）: {len(fetch_titles())} 件")
    for a in pick_articles(n):
        print(f"\n--- {a['title']} （{len(a['extract'])}文字） ---")
        print(a["extract"][:120] + "...")
        print(a["url"])
