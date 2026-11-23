#!/bin/sh
# Runs when a session opens. It tells the session where the MORPH tools live, and puts the
# session's own switch folder, "כלים/.active-<session id>", first in line for every command.
# The folder does not exist, so the computer's own programs run, until this session starts a
# MORPH edit: then it holds the programs the tools bring (Node, Python, ffmpeg), so the editing
# works the same on every computer, and when the session's edit is over it is gone again
# (switch.mjs). A conversation that never asks for MORPH never gets them, also while another
# conversation is editing. The search path is read once, when the session opens, but its folders
# are looked in anew for every command.
# The MORPH folder: in the user's Library on a Mac, in AppData\Local on Windows (where the
# plugin's scripts run in Git Bash).
if [ -n "${MORPH_HOME:-}" ]; then
  dir="$MORPH_HOME"
elif [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
  dir="$(cygpath -m "$LOCALAPPDATA")/MORPH"
else
  dir="$HOME/Library/Application Support/MORPH"
fi
# The session's id, from what Claude Code hands this hook: the text between the quotes that
# follow "session_id". Anything that is not an id as Claude Code writes them is not used, and
# the session gets the one shared folder, "כלים/.active", as sessions always did.
input=""
if [ ! -t 0 ]; then IFS= read -r input || true; fi
id=""
case "$input" in
  *'"session_id"'*)
    rest="${input#*\"session_id\"}"
    rest="${rest#*\"}"
    id="${rest%%\"*}"
    ;;
esac
case "$id" in
  *[!0-9A-Fa-f-]*) id="" ;;
esac
if [ "${#id}" -eq 36 ]; then own=".active-$id"; else own=".active"; fi
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$dir/כלים/bin" ]; then
  if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
    # Windows. Git Bash's search path is split by colons, so the folder goes into it in Git Bash's own
    # form (/c/Users/...). Windows programs find node.exe in its own folder, and Python speaks UTF-8,
    # since it prints Hebrew.
    unix="$(cygpath -u "$dir")"
    printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/%s:$PATH:%s/כלים/.runtime/node"\nexport PYTHONUTF8=1\nexport PYTHONIOENCODING=utf-8\n' "$dir" "$unix" "$own" "$unix" >> "$CLAUDE_ENV_FILE"
  else
    printf 'export MORPH_HOME="%s"\nexport PATH="%s/כלים/%s:$PATH"\n' "$dir" "$dir" "$own" >> "$CLAUDE_ENV_FILE"
  fi
fi
exit 0
