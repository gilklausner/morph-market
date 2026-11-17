#!/bin/sh
# Runs when a session opens. It tells the session where the MORPH tools live, and puts the
# switch folder "כלים/.active" first in line for every command. The folder is empty, so the
# computer's own programs run, until an edit starts: then it holds the programs the tools
# bring (Node, Python, ffmpeg), so the editing works the same on every computer, and when no
# edit is in progress it is empty again (switch.mjs). The search path is read once, when the
# session opens, but its folders are looked in anew for every command.
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
  if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
    # Windows. Git Bash's search path is split by colons, so the folder goes into it in Git Bash's own
    # form (/c/Users/...). Windows programs find node.exe in its own folder, and Python speaks UTF-8,
    # since it prints Hebrew.
    unix="$(cygpath -u "$dir")"
    printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/.active:$PATH:%s/כלים/.runtime/node"\nexport PYTHONUTF8=1\nexport PYTHONIOENCODING=utf-8\n' "$dir" "$unix" "$unix" >> "$CLAUDE_ENV_FILE"
  else
    printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/.active:$PATH"\n' "$dir" "$dir" >> "$CLAUDE_ENV_FILE"
  fi
fi
exit 0
