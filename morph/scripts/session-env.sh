#!/bin/sh
# Runs when a session opens. In a folder that holds the MORPH tools, it puts the programs
# the tools bring (Node, Python, ffmpeg) first in line for every command of the session,
# so the editing works the same on every computer, whatever else is installed on it.
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$dir/כלים/bin" ]; then
  printf 'export PATH="%s/כלים/bin:$PATH"\n' "$dir" >> "$CLAUDE_ENV_FILE"
fi
exit 0
