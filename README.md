# ⚡ 早押しクイズ

問題文が1文字ずつ表示され、**わかった瞬間に Enter を押して答える**早押しクイズアプリ。
早く押すほど高得点になる。

<!-- デプロイしたら URL をここに -->

## 遊び方

1. `/quiz` を開くと、問題文が 100ms ごとに 1 文字ずつ表示される
2. わかった瞬間に **Enter**（または「止める」ボタン）で表示を止める
3. 答えを入力して送信
4. 10 問終わると、スコアとランク（S / A / B / C / D）が出る

## 技術スタック

| | |
|---|---|
| フレームワーク | Next.js 16（App Router） |
| 言語 | TypeScript |
| スタイル | Tailwind CSS v4 |
| データベース | Supabase（PostgreSQL） |
| テスト | `node:test`（Node.js 組み込み） |

## 設計上のポイント

### ログイン（招待制）

Supabase Auth のマジックリンクでログインする。新規登録はオフにしてあり、
管理画面（Authentication → Users → Add user → Create new user、Auto Confirm にチェック）で追加した人だけが入れる。

- `proxy.ts` が全ページの手前で通行証（cookie）を確認し、未ログインなら `/login` へ飛ばす
- 本当の守りは RLS。`quizzes` はログイン済みのときだけ読める（`supabase/schema.sql`）
- `/auth/confirm` がメールのリンクの着地点。標準テンプレートの `?code=`（PKCE）と、自前テンプレートの `?token_hash=` の両方を受け付ける。
  PKCE はリンクを要求したのと同じブラウザでしか開けない（スマホの Gmail アプリ内ブラウザで失敗する）。
  テンプレートの編集には Custom SMTP の設定が要るので、スマホで使う前に設定して token_hash 方式に切り替える

### 日本語の答え合わせ

単純な文字列一致だと「内村航平」に対して「うちむらこうへい」が不正解になり、
早押しクイズとして成立しない。`lib/answerCheck.ts` で入力と正解を同じ形に正規化してから比較している。

- NFKC 正規化（全角英数 → 半角、半角カナ → 全角カナ）
- 空白（半角・全角）と装飾記号（`『』「」・` など）を除去
- カタカナ → ひらがなに統一
- 英字は小文字化

**長音符「ー」は意図的に残している。** 落とすと「コーヒー」が「コヒ」になり、別の語と衝突するため。

正規化だけでは埋まらない「漢字の読み」「略称」（例: `中央アフリカ` ⇔ `中央アフリカ共和国`）は
DB の `accepted_answers` 配列に別解として持たせている。

### スコア設計

`lib/score.ts`。**基礎点 300 + 速度ボーナス最大 700 = 1問1000点満点。**

以前は `(1 - 表示済み文字数 / 全文字数) * 1000` だったため、
全文表示されてから正解しても **0 点**になり、正解した手応えが消えていた。
基礎点を分けたことで「知っているが押すのが遅い」プレイも評価される。

ランクはスコア達成率だけでなく正解率も併せて判定する（`app/result/page.tsx`）。
達成率だけだと、半分しか当たっていないプレイと「全問正解だが遅い」プレイが同じ帯に来てしまうため。

### 出題

毎回ランダムに 10 問。現状は全件取得してからシャッフルしているが、
問題数が数千件規模になったら Postgres 側で `order by random()` する RPC に切り替える（`lib/quizData.ts` にコメントあり）。

### Supabase の一時停止対策

**無料プランのプロジェクトは 7 日間クエリが無いと一時停止され、停止から 90 日で復元不可、やがて削除される。**
このプロジェクトは実際に一度これで消えている（2026年5月〜9月の放置）。

専用の keepalive は持たない。停止の判定はテーブル単位ではなくプロジェクト単位で、
このプロジェクトには毎日 DB に触る処理が複数ある。

- 夜間バッチの `import_approved.py`（起動時に必ず DB を読む）
- 同じプロジェクトに同居している shogi-analyzer / screentime の日次書き込み

どれも同じ Mac で動くので、Mac を 1 週間以上止めるときは出発前にダッシュボードを開いておく。
（以前は `scripts/keepalive.sh` を持っていたが、同じ Mac で動く以上は保険にならないので削除した）

> GitHub Actions で ping する方法もよく紹介されるが、
> **Actions の `schedule` は 60 日コミットが無いと自動停止する**ので、
> 放置プロジェクトの延命目的だと ping 側が先に死ぬ。

## 問題を増やす仕組み

問題はローカルLLM（Ollama / gemma4:e4b）で作る。API 料金はかからない。

### なぜ Wikipedia を読ませるのか

**LLM に知識を出させると事実がでたらめになる。** 実測すると、素の指示で作らせた5問のうち4問が誤りだった。

| 生成方式 | 結果 |
|---|---|
| モデルの知識だけで作らせる | 「柴田勝家は徳川家康に臣従」「窒素は元素番号1と2の次」など5問中4問が誤り |
| **Wikipedia の本文を渡して作らせる** | **事実の誤りなし** |

同じモデルでこの差が出る。4B級のモデルに知識を期待するのが間違いで、
**資料を問題文に組み替える変換タスク**に徹させれば十分な品質になる。
副産物として出典 URL が残るので、怪しい問題はすぐ裏が取れる。

素材は日本語版 Wikipedia の**「良質な記事」**（人手で品質認定された約2,500件）から選ぶ。
ランダム記事だと未整備の項目や極端に短い項目を引くため。

### 生成物は自動でDBに入れない

資料を読ませても、問題文の形式は外すことがある（3文構成になる、冗長になるなど）。
そこで生成物はいったん `data/candidates.json` に貯め、**レビューを通ったものだけ**を投入する。

レビューは Claude（`claude -p`）が `scripts/review_rubric.md` の基準で行う。
形式の崩れは機械で落とせるが、「答えがマニアックすぎて誰も言えない」「ジャンルが合わない」といった
判断は知識が要るので、ローカルの 4B モデルには任せない（上の表のとおり知識タスクは外す）。
判定理由は候補の `review_reason` に残す。

機械的に弾けるものは自動で落とす:

- 資料が150文字未満の記事は作問しない（短い記事は定義の丸写しになる）
- 問題文が45〜150文字の範囲外
- 問題文に答えが露出している
- 疑問形で終わっていない
- 途中に句点がある（早押しクイズは1文が原則）
- 漢字の答えなのに読みがない／読みがひらがなでない
- 既存の問題と答えが重複

### 使い方

```bash
python3 scripts/generate_quiz.py 10     # 候補を10問作る（1問あたり約12秒）
python3 scripts/review_with_claude.py   # Claude にレビューさせて書き戻す（3問で約2分）
python3 scripts/import_approved.py      # 採用したものをDBへ投入
```

`review_with_claude.py` の中身は3段:

```
build_prompt()   採否基準 + pending 候補 + 各候補の Wikipedia 導入部を1つのプロンプトに組む
run_claude()     claude -p --tools "" で読ませ、判定 JSON [{answer,status,reason,question?}] だけ返させる
apply_reviews()  検証して candidates.json に書き戻す（1件でも不正なら何も書かない）
```

Claude に材料を全部渡してツールを持たせないのは、無人実行で候補ファイルや DB を触られる余地を無くすため。
判定の JSON に `question` を付けると問題文の言い回しを手直しできる（元の文は `original_question` に残る）。
`claude -p` はサブスク枠（OAuth）で動くので API 課金はない。`--bare` を付けると API キー必須になるので付けない。

`--dry-run` で書き戻しだけ止められる。`--list` で候補の状態一覧。
手動で見たいときは Claude Code のセッションで「候補をレビューして」と頼む。

### 夜間バッチ

上の3コマンドを `~/cron/quiz.sh` が毎朝5時に順に回す（リポジトリ外）。
起動は cron ではなく launchd の LaunchAgent（`~/Library/LaunchAgents/com.chris.quiz-nightly.plist`）。
ログは `~/cron/logs/quiz/YYYY-MM-DD.log`。途中で失敗したら Slack の #エラー に通知する。
10問生成 → 採用3〜5問 → 投入、で1晩8分ほど。

**cron だと `claude -p` が "Not logged in" で落ちる。** `claude -p` は OAuth 情報を Keychain から引くが、
cron はログイン中の GUI セッションの外で動くので Keychain を読めない（2026-09-23 の初回無人実行で発覚）。
LaunchAgent は GUI セッション内で動くので通る。ターミナルで `env -i` して試すと GUI セッション内なので通ってしまい、再現しない点に注意。
launchd の環境変数もほぼ空で、`USER` が無くても "Not logged in" になるので `quiz.sh` で export している。
スリープ中に5時を過ぎた場合、cron はその回を飛ばすが launchd は復帰時に実行する。

投入にも重複チェックの読み取りにも `SUPABASE_SECRET_KEY` が必要（RLS で匿名の読み書きを塞いでいるため。匿名で読むとエラーにならず 0 件が返るので要注意）。
鍵はこのリポジトリには置かず、他プロジェクトと同じく `~/claude/application/MCP/.env` の
`SUPABASE_URL` / `SUPABASE_SECRET_KEY` を借りる（URL が一致するときだけ使う）。
`.env.local` に置くのは Next.js が読む公開キーだけ。`NEXT_PUBLIC_` 付きで Secret key を書くとブラウザに配信されるので絶対にしない。

依存は標準ライブラリのみ。仮想環境も `pip install` も要らない。

## セットアップ

```bash
npm install
```

### 1. Supabase プロジェクトを作る

[supabase.com](https://supabase.com/dashboard) で New project（Region: Northeast Asia (Tokyo)）。

### 2. テーブルとデータを入れる

SQL Editor で以下の順に実行する。

```
supabase/schema.sql   # テーブル定義 + RLS（ログイン済みのみ読み取り可）
supabase/seed.sql     # 問題データ 34 問
```

### 3. 環境変数

`.env.local` を作る（Project Settings → API から取得）。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
```

### 4. 起動

```bash
npm run dev    # http://localhost:3000
```

### 5. 定期実行を仕込む

夜間バッチ（生成 → レビュー → 投入）は launchd に登録する（cron では `claude -p` が動かない。理由は「夜間バッチ」の節）。

```bash
# ~/Library/LaunchAgents/com.chris.quiz-nightly.plist を置いてから（StartCalendarInterval で Hour 5 / Minute 0、~/cron/quiz.sh を bash で起動）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.chris.quiz-nightly.plist
launchctl kickstart gui/$(id -u)/com.chris.quiz-nightly   # 今すぐ1回動かして確かめる
```

## テスト

```bash
npm test
```

答え合わせの正規化とスコア計算に対する 15 件のテスト。
どちらも DB・ブラウザに依存しない純粋関数として切り出してあるので、ネットワーク無しで実行できる。
