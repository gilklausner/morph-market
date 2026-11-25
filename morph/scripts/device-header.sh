#!/bin/sh
# Prints the header that tells the MORPH server which computer a connection comes from.
# Claude Code runs it each time it connects to the server (see .mcp.json).
#
# The id is a code made once and kept in the user's home folder (device.mjs explains how
# it is made, and this makes it the same way). A MORPH key works from a limited number of
# computers, and this is how the server tells one from another. It is a plain shell
# script, so it works before the MORPH tools, and the Node they bring, are installed.
file="$HOME/.morph/device"
id=""
[ -r "$file" ] && id=$(tr -d '[:space:]' < "$file")
case "$id" in
  *[!0-9a-f]* | "") id="" ;;
esac
if [ ${#id} -ne 32 ]; then
  # The fingerprint of the id the system gives the computer (device.mjs explains): the
  # hardware id on a Mac, the machine id on Windows (when this runs in Git Bash there).
  # Without one, or without a program that makes fingerprints, a random code.
  machine=$(/usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | sed -n 's/.*"IOPlatformUUID" = "\([0-9A-Fa-f-]\{36\}\)".*/\1/p' | head -n 1)
  [ -z "$machine" ] && machine=$(reg.exe query 'HKLM\SOFTWARE\Microsoft\Cryptography' //v MachineGuid //reg:64 2>/dev/null | sed -n 's/.*MachineGuid[[:space:]]*REG_SZ[[:space:]]*\([0-9A-Fa-f-]\{36\}\).*/\1/p' | head -n 1)
  machine=$(printf '%s' "$machine" | tr 'A-F' 'a-f')
  id=""
  if [ ${#machine} -eq 36 ]; then
    if command -v shasum >/dev/null 2>&1; then id=$(printf 'morph:%s' "$machine" | shasum -a 256 | cut -c1-32)
    elif command -v sha256sum >/dev/null 2>&1; then id=$(printf 'morph:%s' "$machine" | sha256sum | cut -c1-32)
    fi
  fi
  case "$id" in *[!0-9a-f]*) id="" ;; esac
  [ ${#id} -ne 32 ] && id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  # Only the user may read it: the folder is made 0700 and the file 0600. A file that was
  # there already, with something else in it, keeps its old mode when written, so it is set.
  (umask 077 && mkdir -p "$HOME/.morph" && printf '%s\n' "$id" > "$file")
  chmod 600 "$file" 2>/dev/null
fi
printf '{"X-Morph-Device":"%s"}\n' "$id"
