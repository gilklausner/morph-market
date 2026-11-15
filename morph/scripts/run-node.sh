#!/bin/sh
# Runs one of the plugin's Node scripts. The MORPH tools bring their own Node, inside
# the MORPH folder, so the plugin never needs one installed on the computer. Before the
# tools are installed there is nothing for these scripts to do, and it ends quietly.
# The MORPH folder: in the user's Library on a Mac, in AppData\Local on Windows (where the
# plugin's scripts run in Git Bash).
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
if [ -x "$dir/כלים/.runtime/node/node.exe" ]; then
  exec "$dir/כלים/.runtime/node/node.exe" "$@"
elif [ -x "$dir/כלים/bin/node" ]; then
  exec "$dir/כלים/bin/node" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$@"
fi
exit 0
