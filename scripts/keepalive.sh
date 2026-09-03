#!/usr/bin/env bash
#
# Supabase の無料プランは 7 日間クエリが無いとプロジェクトが一時停止され、
# 停止から 90 日で 1クリック復元ができなくなり、やがてインフラごと削除される。
# （このプロジェクトは 2026年5月〜9月の放置で実際に消えた）
#
# 毎日 1 回、いちばん軽いクエリを投げて「使っている」状態を保つ。
#
# crontab 例:
#   30 7 * * * /Users/takegawayusuke/claude/application/quiz/scripts/keepalive.sh >> /Users/takegawayusuke/cron/logs/quiz-keepalive.log 2>&1

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "$(date '+%F %T') NG .env.local がない"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/quizzes?select=id&limit=1" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" \
  -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" || echo "000")

if [ "$status" = "200" ]; then
  echo "$(date '+%F %T') ok"
else
  # 000 = 名前解決すらできない（＝プロジェクトが消えた可能性）
  echo "$(date '+%F %T') NG http=${status} — Supabase ダッシュボードを確認すること"
  exit 1
fi
