#!/usr/bin/env bash
# PIPELINE §11 "shared-file lock": block edits to files locked in another
# session's sync file. Dormant while every other sync says "none".
f=$(cat | jq -r '.tool_input.file_path // empty'); [ -z "$f" ] && exit 0
rel=${f#"$PWD"/}
for sync in docs/team/sync/*.md; do
  [ -e "$sync" ] || continue
  [ "$(basename "$sync")" = "muskan.md" ] && continue
  # "none" is judged on the header line only; matching sees the full block
  # (a lock list can run many lines). Wildcard locks (e2e/*) still don't
  # expand — list files explicitly when locking.
  block=$(grep -A20 -i 'Shared files locked' "$sync")
  echo "$block" | head -2 | grep -qi 'none' && continue
  if [ -n "$block" ] && { echo "$block" | grep -qF "$rel" || echo "$block" | grep -qF "$(basename "$rel")"; }; then
    echo "BLOCKED: $rel appears in $(basename "$sync")'s locked list. Sync ritual first (WORKFLOW.md)." >&2
    exit 2
  fi
done
exit 0
