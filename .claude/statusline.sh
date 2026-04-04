#!/bin/bash
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
FIVE_H_RESET=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
WEEK_RESET=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
MAGENTA='\033[35m'
RESET='\033[0m'

# Context bar color
if [ "$PCT" -ge 90 ]; then
  BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then
  BAR_COLOR="$YELLOW"
else
  BAR_COLOR="$GREEN"
fi

FILLED=$((PCT / 10))
EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"
printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

BRANCH=""
git rev-parse --git-dir > /dev/null 2>&1 && BRANCH=" | 🌿 $(git branch --show-current 2>/dev/null)"

fmt_pct() {
  if [ -n "$1" ]; then
    printf '%.0f%%' "$1"
  else
    printf '--'
  fi
}

fmt_reset() {
  if [ -z "$1" ] || [ "$1" = "null" ]; then
    printf '--'
  else
    date -d "$1" '+%b %-d %H:%M' 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%S%z' "$1" '+%b %-d %H:%M' 2>/dev/null || printf '%s' "$1"
  fi
}

echo -e "${CYAN}[$MODEL]${RESET} 📁 ${DIR##*/}$BRANCH"
echo -e "${BAR_COLOR}${BAR}${RESET} ${PCT}% context"
echo -e "${MAGENTA}5h:${RESET} $(fmt_pct "$FIVE_H")  reset: $(fmt_reset "$FIVE_H_RESET") | ${MAGENTA}7d:${RESET} $(fmt_pct "$WEEK")  reset: $(fmt_reset "$WEEK_RESET")"