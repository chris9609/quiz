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

-- 匿名ユーザーには読み取りだけ許可する（書き込みは service_role のみ）
alter table quizzes enable row level security;

drop policy if exists "quizzes are readable by anyone" on quizzes;
create policy "quizzes are readable by anyone"
  on quizzes for select
  to anon, authenticated
  using (true);
