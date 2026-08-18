#!/usr/bin/env bash
# PIPELINE §11 "shared-file lock": block edits to files locked in another
# session's sync file. Dormant while every other sync says "none".
f=$(cat | jq -r '.tool_input.file_path // empty'); [ -z "$f" ] && exit 0
rel=${f#"$PWD"/}
for sync in docs/team/sync/*.md; do
  [ -e "$sync" ] || continue
  [ "$(basename "$sync")" = "muskan.md" ] && continue
  locked=$(grep -A2 -i 'Shared files locked' "$sync" | head -3)
  echo "$locked" | grep -qi 'none' && continue
  if [ -n "$locked" ] && echo "$locked" | grep -qF "$(basename "$rel")"; then
    echo "BLOCKED: $rel appears in $(basename "$sync")'s locked list. Sync ritual first (WORKFLOW.md)." >&2
    exit 2
  fi
done
exit 0
