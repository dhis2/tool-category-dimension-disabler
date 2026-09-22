#!/usr/bin/env bash
# Record favorite view events on a DHIS2 instance so the usage ranking is
# non-trivial when testing. Usage:
#   scripts/generate-view-events.sh http://dhis2-agent-cdd-sl43:8080 admin:district
# Records N views per favorite, where N decreases along the list, for the
# first 5 visualizations, 3 maps and 3 event visualizations.
set -euo pipefail
BASE="${1:?base url}"; AUTH="${2:-admin:district}"

record() { # eventType uid count
    for _ in $(seq 1 "$3"); do
        curl -s -o /dev/null -u "$AUTH" -X POST "$BASE/api/dataStatistics?eventType=$1&favorite=$2"
    done
    echo "$1 $2 x$3"
}

# Each uid list is captured into a variable first (with a fallback to an
# empty string) rather than looped over directly, so a request failure or an
# empty result (e.g. no event visualizations on this instance) never aborts
# the script under `set -euo pipefail` and simply skips that batch.

n=5
visualization_uids=$(curl -s -u "$AUTH" "$BASE/api/visualizations?fields=id&pageSize=5&filter=categoryDimensions:!empty" | jq -r '.visualizations[].id' 2>/dev/null || true)
for uid in $visualization_uids; do
    record VISUALIZATION_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done

n=3
map_uids=$(curl -s -u "$AUTH" "$BASE/api/maps?fields=id&pageSize=3" | jq -r '.maps[].id' 2>/dev/null || true)
for uid in $map_uids; do
    record MAP_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done

n=3
event_visualization_uids=$(curl -s -u "$AUTH" "$BASE/api/eventVisualizations?fields=id&pageSize=3" | jq -r '.eventVisualizations[].id' 2>/dev/null || true)
for uid in $event_visualization_uids; do
    record EVENT_VISUALIZATION_VIEW "$uid" $n; n=$((n>1 ? n-1 : 1))
done
