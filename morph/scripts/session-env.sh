#!/bin/sh
# Runs when a session opens. It tells the session where the MORPH tools live, and puts the
# programs they bring (Node, Python, ffmpeg) first in line for every command, so the
# editing works the same on every computer, whatever else is installed on it.
dir="${MORPH_HOME:-$HOME/Library/Application Support/MORPH}"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$dir/כלים/bin" ]; then
  printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/bin:$PATH"\n' "$dir" "$dir" >> "$CLAUDE_ENV_FILE"
fi
exit 0
