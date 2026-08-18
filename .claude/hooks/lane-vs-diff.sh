#!/usr/bin/env bash
# PIPELINE §11 "lane vs diff": lane: TRIVIAL while the staged diff touches
# migrations, RLS/auth surfaces, or server actions -> block, force re-triage.
# Fires only on git commit. Current slug = most recently modified STATE.md.
cmd=$(cat | jq -r '.tool_input.command // empty')
echo "$cmd" | grep -q 'git commit' || exit 0
staged=$(git diff --cached --name-only 2>/dev/null)
[ -z "$staged" ] && exit 0
echo "$staged" | grep -qE '^supabase/migrations/|/actions\.ts$|^src/modules/[^/]+/server/' || exit 0
state=$(ls -t docs/muskan-build/*/STATE.md 2>/dev/null | head -1)
[ -z "$state" ] && exit 0
if grep -qE '^lane:[[:space:]]*TRIVIAL' "$state"; then
  echo "BLOCKED (lane vs diff): staged files touch migrations/RLS/auth/server actions but $state says lane: TRIVIAL. Re-triage the slug (PIPELINE §2) before committing." >&2
  exit 2
fi
exit 0
