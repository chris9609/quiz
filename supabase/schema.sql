create table quizzes (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  created_at timestamptz default now()
);

insert into quizzes (question, answer) values
  ('日本で一番高い山はどこですか？', '富士山'),
  ('1年は何日ありますか？', '365'),
  ('水の化学式は何ですか？', 'H2O'),
  ('太陽系で一番大きな惑星は何ですか？', '木星'),
  ('日本の首都はどこですか？', '東京'),
  ('人間の体の中で一番大きな臓器は何ですか？', '肝臓'),
  ('世界で一番長い川はどこですか？', 'ナイル川'),
  ('サッカーのワールドカップは何年ごとに開催されますか？', '4'),
  ('日本語で「ありがとう」を英語で言うと何ですか？', 'thank you'),
  ('光の速さは秒速約何万キロメートルですか？', '30');
