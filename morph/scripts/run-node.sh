#!/bin/sh
# Runs one of the plugin's Node scripts. The MORPH tools bring their own Node, inside
# the MORPH folder, so the plugin never needs one installed on the computer. Before the
# tools are installed there is nothing for these scripts to do, and it ends quietly.
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -x "$dir/כלים/bin/node" ]; then
  exec "$dir/כלים/bin/node" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$@"
fi
exit 0
