#!/usr/bin/env bash
# Engram auto-capture — a Claude Code SessionEnd hook.
#
# When a coding session ends, this flattens the transcript and pipes it to
# `engram distill`, which extracts the durable lessons and captures them — so
# your codebase's memory grows on its own, with zero manual effort.
#
# Register it in your project's .claude/settings.json (see engram-settings.json),
# and make sure `engram login` has been run once. Runs in the background so it
# never delays Claude Code.
set -euo pipefail

payload="$(cat)"
transcript="$(printf '%s' "$payload" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null || true)"

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Flatten the JSONL transcript to plain "role: text" lines, then distill it.
{
  python3 - "$transcript" <<'PY' | engram distill >/dev/null 2>&1
import sys, json
for line in open(sys.argv[1]):
    try:
        m = json.loads(line).get("message", {})
        c = m.get("content", "")
        if isinstance(c, list):
            c = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
        if isinstance(c, str) and c.strip():
            print(f'{m.get("role","")}: {c}')
    except Exception:
        pass
PY
} &

exit 0
