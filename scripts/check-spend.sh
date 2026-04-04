#!/usr/bin/env bash
# =============================================================================
# CartSpoon — Quick Cost Check
# =============================================================================
# Pulls LLM spend and plan stats from the local or remote Supabase DB.
# Run anytime to get a quick cost snapshot.
#
# Usage:
#   bash scripts/check-spend.sh           # local Supabase (default)
#   bash scripts/check-spend.sh --remote  # remote Supabase (requires DATABASE_URL)
#   bash scripts/check-spend.sh --week    # this week only (default: today)
#   bash scripts/check-spend.sh --month   # last 30 days
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
label()  { echo -e "${CYAN}$1${NC}"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
USE_REMOTE=false
PERIOD="today"

for arg in "$@"; do
  case $arg in
    --remote) USE_REMOTE=true ;;
    --week)   PERIOD="week" ;;
    --month)  PERIOD="month" ;;
  esac
done

# ── Set DB connection ─────────────────────────────────────────────────────────
if [ "$USE_REMOTE" = true ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL not set. Export it or use local mode."
    exit 1
  fi
  DB_URL="$DATABASE_URL"
  echo -e "${YELLOW}Using REMOTE database${NC}"
else
  DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  if ! psql "$DB_URL" -c "SELECT 1" >/dev/null 2>&1; then
    echo "Local Supabase not running. Start with: cd supabase && npx supabase start"
    exit 1
  fi
  echo -e "${GREEN}Using LOCAL database${NC}"
fi

PSQL="psql $DB_URL -t --no-align"

# ── Build date filter ─────────────────────────────────────────────────────────
case $PERIOD in
  today)
    DATE_FILTER="WHERE logged_date = CURRENT_DATE"
    DATE_FILTER_MP="WHERE created_at::date = CURRENT_DATE"
    LABEL="Today"
    ;;
  week)
    DATE_FILTER="WHERE logged_date >= date_trunc('week', now())::date + 1"
    DATE_FILTER_MP="WHERE week_of = (date_trunc('week', now()) + INTERVAL '1 day')::date"
    LABEL="This week"
    ;;
  month)
    DATE_FILTER="WHERE logged_date >= CURRENT_DATE - 30"
    DATE_FILTER_MP="WHERE created_at >= NOW() - INTERVAL '30 days'"
    LABEL="Last 30 days"
    ;;
esac

echo -e "\n${GREEN}CartSpoon Cost Report — $LABEL${NC}"
echo -e "${GREEN}Generated: $(date '+%Y-%m-%d %H:%M')${NC}"

# ── LLM Spend ─────────────────────────────────────────────────────────────────
header "LLM Spend"

$PSQL << SQL
SELECT
  model,
  user_tier,
  COUNT(*)                                              AS calls,
  SUM(input_tokens)                                     AS input_tokens,
  SUM(cached_tokens)                                    AS cached_tokens,
  CASE
    WHEN SUM(input_tokens) > 0
    THEN ROUND(SUM(cached_tokens)::numeric / SUM(input_tokens) * 100, 1)::text || '%'
    ELSE 'n/a'
  END                                                   AS cache_hit_pct,
  SUM(output_tokens)                                    AS output_tokens,
  '\$' || ROUND(SUM(cost_usd)::numeric, 4)              AS total_cost,
  '\$' || ROUND(AVG(cost_usd)::numeric, 6)              AS avg_per_call
FROM llm_usage_log
$DATE_FILTER
GROUP BY model, user_tier
ORDER BY SUM(cost_usd) DESC;
SQL

# Total spend
TOTAL_SPEND=$($PSQL -c "SELECT ROUND(COALESCE(SUM(cost_usd), 0)::numeric, 4) FROM llm_usage_log $DATE_FILTER;" 2>/dev/null | tr -d ' ')
TOTAL_CALLS=$($PSQL -c "SELECT COUNT(*) FROM llm_usage_log $DATE_FILTER;" 2>/dev/null | tr -d ' ')

echo ""
label "Total: \$$TOTAL_SPEND across $TOTAL_CALLS calls"

# ── Cache Efficiency ──────────────────────────────────────────────────────────
header "Cache Efficiency"

$PSQL << SQL
SELECT
  logged_date,
  COUNT(*)                                              AS calls,
  CASE
    WHEN SUM(input_tokens) > 0
    THEN ROUND(SUM(cached_tokens)::numeric / SUM(input_tokens) * 100, 1)::text || '%'
    ELSE 'n/a'
  END                                                   AS cache_hit_pct,
  '\$' || ROUND(SUM(cost_usd)::numeric, 4)              AS daily_cost
FROM llm_usage_log
$DATE_FILTER
GROUP BY logged_date
ORDER BY logged_date DESC
LIMIT 7;
SQL

# ── Meal Plans ────────────────────────────────────────────────────────────────
header "Meal Plans"

$PSQL << SQL
SELECT
  week_of,
  COUNT(*)                                              AS total_plans,
  COUNT(*) FILTER (WHERE is_premium_plan)               AS premium_plans,
  COUNT(*) FILTER (WHERE NOT is_premium_plan)           AS free_plans,
  '\$' || ROUND(AVG(total_cost) FILTER (WHERE total_cost IS NOT NULL)::numeric, 2) AS avg_estimated_cost
FROM meal_plans
$DATE_FILTER_MP
GROUP BY week_of
ORDER BY week_of DESC
LIMIT 5;
SQL

# ── Scraper Health ────────────────────────────────────────────────────────────
header "Scraper Health (current week)"

$PSQL << SQL
SELECT
  s.name                                                AS store,
  COUNT(si.id)                                          AS items_this_week,
  CASE
    WHEN COUNT(si.id) >= 20 THEN 'OK'
    WHEN COUNT(si.id) > 0   THEN 'LOW'
    ELSE 'MISSING'
  END                                                   AS status,
  MIN(si.sale_price)                                    AS min_price,
  MAX(si.sale_price)                                    AS max_price
FROM stores s
LEFT JOIN sale_items si
  ON si.store_id = s.id
 AND si.week_of = (date_trunc('week', now()) + INTERVAL '1 day')::date
WHERE s.is_active = true
GROUP BY s.name, s.chain_key
ORDER BY s.name;
SQL

# ── Cost Projections ──────────────────────────────────────────────────────────
header "Projections"

$PSQL << SQL
WITH daily AS (
  SELECT
    logged_date,
    SUM(cost_usd) AS daily_cost,
    COUNT(*)      AS daily_calls
  FROM llm_usage_log
  WHERE logged_date >= CURRENT_DATE - 7
  GROUP BY logged_date
  HAVING COUNT(*) > 0
)
SELECT
  '\$' || ROUND(AVG(daily_cost)::numeric, 4)           AS avg_daily_cost,
  '\$' || ROUND((AVG(daily_cost) * 30)::numeric, 2)    AS projected_monthly,
  '\$' || ROUND((AVG(daily_cost) * 365)::numeric, 2)   AS projected_annual,
  ROUND(AVG(daily_calls)::numeric, 1)                  AS avg_daily_calls
FROM daily;
SQL

# ── User Stats ────────────────────────────────────────────────────────────────
header "Users"

$PSQL << SQL
SELECT
  tier,
  COUNT(*)                                              AS total_users,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
FROM users
GROUP BY tier
ORDER BY tier;
SQL

# ── Daily Spend Threshold ─────────────────────────────────────────────────────
header "Alert Status"

TODAY_SPEND=$($PSQL -c "SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage_log WHERE logged_date = CURRENT_DATE;" 2>/dev/null | tr -d ' ')
THRESHOLD=5.00

if (( $(echo "$TODAY_SPEND >= $THRESHOLD" | bc -l) )); then
  echo -e "${YELLOW}⚠ TODAY'S SPEND: \$$TODAY_SPEND (ABOVE threshold of \$$THRESHOLD)${NC}"
else
  echo -e "${GREEN}✓ Today's spend: \$$TODAY_SPEND (below \$$THRESHOLD threshold)${NC}"
fi

echo ""
echo -e "${GREEN}Run with --month for 30-day view, --remote for production data.${NC}"
