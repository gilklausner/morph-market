#!/bin/sh
# Runs when a session opens. It tells the session where the MORPH tools live, and puts the
# programs they bring (Node, Python, ffmpeg) first in line for every command, so the
# editing works the same on every computer, whatever else is installed on it.
# The MORPH folder: in the user's Library on a Mac, in AppData\Local on Windows (where the
# plugin's scripts run in Git Bash).
if [ -n "${MORPH_HOME:-}" ]; then
  dir="$MORPH_HOME"
elif [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
  dir="$(cygpath -m "$LOCALAPPDATA")/MORPH"
else
  dir="$HOME/Library/Application Support/MORPH"
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$dir/כלים/bin" ]; then
  printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/bin:$PATH"\n' "$dir" "$dir" >> "$CLAUDE_ENV_FILE"
  # On Windows: Windows programs find node.exe in its own folder, and Python speaks UTF-8, since it prints Hebrew.
  if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
    printf 'export PATH="$PATH:%s/כלים/.runtime/node"\nexport PYTHONUTF8=1\nexport PYTHONIOENCODING=utf-8\n' "$dir" >> "$CLAUDE_ENV_FILE"
  fi
fi
exit 0
