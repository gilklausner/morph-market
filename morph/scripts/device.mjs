// This computer's id for MORPH: a random code, made once and kept in the user's home
// folder. A MORPH key works from a limited number of computers, and this is how the
// server tells one computer from another. It says nothing about the computer itself.
//
// Only the user may read it: the folder is made 0700 and the file 0600, and a file an
// earlier version left open to the computer's other users is closed. Windows keeps the
// user's home folder private by itself, and has no such modes.

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const folder = join(homedir(), ".morph");
const file = join(folder, "device");

/** Closes the file to the computer's other users, when it is open to them. */
function keepPrivate() {
  if (process.platform === "win32") return;
  try {
    if (statSync(file).mode & 0o077) chmodSync(file, 0o600);
  } catch {
    // Not there, or not the user's own: it is left as it is.
  }
}

export function deviceId() {
  try {
    const id = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(id)) {
      keepPrivate();
      return id;
    }
  } catch {
    // First use on this computer.
  }
  const id = randomBytes(16).toString("hex");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${id}\n`, { mode: 0o600 });
  // A file that was there already, with something else in it, keeps its old mode when written.
  keepPrivate();
  return id;
}
