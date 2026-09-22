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

`scripts/keepalive.sh` を cron で毎日回して、軽いクエリを 1 本投げることで防ぐ。

問題を投入する `import_approved.py` も起動時に必ず DB を読むので同じ効果があるが、
そちらは生成パイプラインが壊れると動かなくなる。**独立して動く保険として keepalive を別に持つ。**

> GitHub Actions で ping する方法もよく紹介されるが、
> **Actions の `schedule` は 60 日コミットが無いと自動停止する**ので、
> 放置プロジェクトの延命目的だと ping 側が先に死ぬ。ローカル cron のほうが確実。

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

レビューは Claude（Claude Code のセッション）が `scripts/review_rubric.md` の基準で行う。
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

投入には `SUPABASE_SECRET_KEY` が必要（RLS で匿名の書き込みを塞いでいるため）。
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
supabase/schema.sql   # テーブル定義 + RLS（匿名は読み取りのみ）
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

### 5. cron を仕込む

```
# 毎日: Supabase の一時停止を防ぐ
30 7 * * * /path/to/quiz/scripts/keepalive.sh >> ~/cron/logs/quiz-keepalive.log 2>&1

# 毎週月曜: 問題の候補を10問ぶん作って貯めておく
0 6 * * 1 cd /path/to/quiz && python3 scripts/generate_quiz.py 10 >> ~/cron/logs/quiz-generate.log 2>&1
```

**レビューと投入は cron に載せない。** 候補の採否は Claude が知識ベースで判断するのがこの仕組みの要で、
自動投入すると Wikipedia を読ませても残る形式の崩れ（多文構成など）がそのまま入る。
貯まった候補は手が空いたときに Claude Code で「候補をレビューして」と頼んで処理する。

## テスト

```bash
npm test
```

答え合わせの正規化とスコア計算に対する 15 件のテスト。
どちらも DB・ブラウザに依存しない純粋関数として切り出してあるので、ネットワーク無しで実行できる。
