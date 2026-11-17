#!/bin/sh
# Prints the header that tells the MORPH server which computer a connection comes from.
# Claude Code runs it each time it connects to the server (see .mcp.json).
#
# The id is a random code, made once and kept in the user's home folder. A MORPH key
# works from a limited number of computers, and this is how the server tells one from
# another. It says nothing about the computer itself. It is a plain shell script, so it
# works before the MORPH tools, and the Node they bring, are installed.
file="$HOME/.morph/device"
id=""
[ -r "$file" ] && id=$(tr -d '[:space:]' < "$file")
case "$id" in
  *[!0-9a-f]* | "") id="" ;;
esac
if [ ${#id} -ne 32 ]; then
  id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  # Only the user may read it: the folder is made 0700 and the file 0600. A file that was
  # there already, with something else in it, keeps its old mode when written, so it is set.
  (umask 077 && mkdir -p "$HOME/.morph" && printf '%s\n' "$id" > "$file")
  chmod 600 "$file" 2>/dev/null
fi
printf '{"X-Morph-Device":"%s"}\n' "$id"
