-- 早押しクイズ: テーブル定義
-- Supabase の SQL Editor にそのまま貼って実行する（seed.sql より先）

create table if not exists quizzes (
  id               uuid primary key default gen_random_uuid(),
  question         text not null,
  answer           text not null,
  -- 別解（読みがな・略称・表記ゆれ）。判定時は answer と同じ正規化を通して突き合わせる。
  -- カタカナ⇔ひらがなや記号は lib/answerCheck.ts の正規化が吸収するので、
  -- ここに入れるのは「漢字の読み」「略称」など正規化では埋まらないものだけ。
  accepted_answers text[] not null default '{}',
  created_at       timestamptz not null default now()
);

-- ログイン済みユーザーには読み取りだけ許可する（書き込みは service_role のみ）。
-- 匿名（公開キーだけ）で読むとエラーではなく空配列が返る。
-- ログインは招待制（Supabase Auth の新規登録はオフ、管理画面で追加した人だけ）。
alter table quizzes enable row level security;

drop policy if exists "quizzes are readable by anyone" on quizzes;
drop policy if exists "quizzes are readable by signed-in users" on quizzes;
create policy "quizzes are readable by signed-in users"
  on quizzes for select
  to authenticated
  using (true);

-- Anki に入れたい問題の記録。アプリの「+ Anki」ボタンが1行ずつ足し、
-- Mac 上の scripts/export_anki.py（secret key）が AnkiConnect へ入れて added_at を埋める。
-- デプロイ先から localhost の AnkiConnect には届かないので、DB に希望を残してローカルで拾う分担。
create table if not exists anki_requests (
  id          bigint generated always as identity primary key,
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  added_at    timestamptz,               -- Anki に入れ終わった時刻。null = 未投入
  unique (quiz_id, user_id)              -- 同じ問題を何度押しても1件
);

-- 読み書きできるのは管理者（自分）だけ。招待した友達は解けるが Anki には入れられない。
-- <自分のUID> は Authentication → Users の自分の行の UID に置き換える。
alter table anki_requests enable row level security;

drop policy if exists "owner can read own anki requests" on anki_requests;
create policy "owner can read own anki requests"
  on anki_requests for select
  to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = '<自分のUID>');

drop policy if exists "owner can request anki cards" on anki_requests;
create policy "owner can request anki cards"
  on anki_requests for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select auth.uid()) = '<自分のUID>');
