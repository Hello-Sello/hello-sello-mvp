#!/usr/bin/env bash
# PIPELINE §11 "STATE.md advance": a skill finishing without advancing stage.
# Fires at Stop. If this session modified files inside a slug folder but NOT
# that slug's STATE.md, block the stop ONCE with the reason.
input=$(cat)
echo "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1 && exit 0
changed=$(git status --porcelain docs/muskan-build/ 2>/dev/null | awk '{print $NF}')
[ -z "$changed" ] && exit 0
for slug_dir in $(echo "$changed" | grep -o 'docs/muskan-build/[^/]*/' | sort -u); do
  if ! echo "$changed" | grep -q "^${slug_dir}STATE.md$"; then
    echo "Files changed in ${slug_dir} but its STATE.md was not advanced. Update stage/Attempts/Gate log — or state why no advance is needed." >&2
    exit 2
  fi
done
exit 0
