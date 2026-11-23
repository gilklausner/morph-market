#!/bin/sh
# Runs one of the plugin's Node scripts. The MORPH tools bring their own Node, inside
# the MORPH folder, so the plugin never needs one installed on the computer. Before the
# tools are installed there is nothing for these scripts to do, and it ends quietly.
#
#   sh run-node.sh <script> ...             always
#   sh run-node.sh --editing <script> ...   only while a MORPH edit is in progress on the computer
#   sh run-node.sh --named <script> ...     then, and also when the user's message names MORPH, or
#                                           a conversation named it lately
#
# The last two are for the hooks that have something to do only in a MORPH edit, or only when
# the user asked about MORPH: the end of a turn, a message, a command that finished, a helper
# that stopped. In any other conversation they end right here, before Node is started, so a
# conversation that has nothing to do with MORPH gets nothing from them and waits for nothing.
# What says so are the plugin's own lists: the downloads (downloads.mjs), which are empty when
# no edit is in progress, and the conversations that named MORPH (editing.mjs).
# The MORPH folder: in the user's Library on a Mac, in AppData\Local on Windows (where the
# plugin's scripts run in Git Bash).

# True when one of the plugin's lists is not there, or holds nothing. A list that is being
# written just now, or reads any other way, is taken to hold something.
nothing() {
  [ -f "$1" ] || return 0
  first=""
  IFS= read -r first < "$1" || true
  case "$first" in
    "[]" | "{}") return 0 ;;
  esac
  return 1
}

gate=""
case "${1:-}" in
  --editing | --named)
    gate="$1"
    shift
    ;;
esac
# What Claude Code handed the hook, when it was read here to look at the message.
handed=""
if [ -n "$gate" ] && [ -n "${CLAUDE_PLUGIN_DATA:-}" ] && nothing "$CLAUDE_PLUGIN_DATA/downloads.json"; then
  [ "$gate" = "--editing" ] && exit 0
  if nothing "$CLAUDE_PLUGIN_DATA/named.json"; then
    # No edit, and no conversation named MORPH lately: only a message that names it goes on.
    # The name is looked for anywhere in what was handed, so nothing that names it is missed;
    # the script itself looks at the message alone.
    input=""
    while IFS= read -r line || [ -n "$line" ]; do
      input="$input$line
"
    done
    case "$input" in
      *[Mm][Oo][Rr][Pp][Hh]* | *מורף* | *מורפ* | *'מור'* | *'מור'*) handed="$input" ;;
      *) exit 0 ;;
    esac
  fi
fi

if [ -n "${MORPH_HOME:-}" ]; then
  dir="$MORPH_HOME"
elif [ -n "${LOCALAPPDATA:-}" ]; then
  # Windows. The folder is taken as Windows wrote it: asking cygpath for it starts another
  # program, and this runs after every command Claude runs.
  dir="$LOCALAPPDATA/MORPH"
else
  dir="$HOME/Library/Application Support/MORPH"
fi
# On Windows, Node itself and not its shortcut in "כלים/bin": the shortcut is a shell script
# of its own, and starting it costs two more programs on every run.
start() {
  if [ -x "$dir/כלים/.runtime/node/node.exe" ]; then
    exec "$dir/כלים/.runtime/node/node.exe" "$@"
  elif [ -x "$dir/כלים/bin/node" ]; then
    exec "$dir/כלים/bin/node" "$@"
  elif command -v node >/dev/null 2>&1; then
    exec node "$@"
  fi
  exit 0
}
if [ -n "$handed" ]; then
  # What was read above goes on to the script, as it came.
  start "$@" <<MORPH_HANDED
$handed
MORPH_HANDED
fi
start "$@"
