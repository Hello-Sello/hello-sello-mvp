#!/usr/bin/env bash
# PIPELINE §11 "STATE.md advance": a skill finishing without advancing stage.
# Fires at Stop. Skills commit as they go, so a clean tree proves nothing —
# check uncommitted changes AND the last commit (when it is recent enough to
# belong to this session). Blocks the stop ONCE with the reason.
input=$(cat)
echo "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1 && exit 0
changed=$(git status --porcelain docs/muskan-build/ 2>/dev/null | awk '{print $NF}')
head_ts=$(git log -1 --format=%ct 2>/dev/null || echo 0)
if [ $(( $(date +%s) - head_ts )) -lt 21600 ]; then
  changed="$changed
$(git show --name-only --format= HEAD -- docs/muskan-build/ 2>/dev/null)"
fi
changed=$(echo "$changed" | sed '/^$/d')
[ -z "$changed" ] && exit 0
for slug_dir in $(echo "$changed" | grep -o 'docs/muskan-build/[^/]*/' | sort -u); do
  if ! echo "$changed" | grep -q "^${slug_dir}STATE.md$"; then
    echo "Files changed in ${slug_dir} (working tree or last commit) but its STATE.md was not advanced. Update stage/Attempts/Gate log — or state why no advance is needed." >&2
    exit 2
  fi
done
exit 0
