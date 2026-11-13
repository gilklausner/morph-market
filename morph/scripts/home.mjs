// Where the MORPH tools live on this computer: one folder, out of sight, the same for
// every session, whatever folder the session was opened in.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The MORPH folder. MORPH_HOME is for testing only. */
export function morphHome() {
  if (process.env.MORPH_HOME) return process.env.MORPH_HOME;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "MORPH");
  return join(homedir(), "Library", "Application Support", "MORPH");
}

/** True when the tools are installed there. */
export const installed = () => existsSync(join(morphHome(), "כלים", "version"));

/** Keeps the folder, and everything at its top, out of sight in the file browser. */
export function hide() {
  const home = morphHome();
  if (!existsSync(home)) return;
  const paths = [home, ...readdirSync(home).map((name) => join(home, name))];
  if (process.platform === "darwin") spawnSync("chflags", ["hidden", ...paths]);
  else if (process.platform === "win32") for (const path of paths) spawnSync("attrib", ["+h", path]);
}

/** Things that sat in the holding folder for longer than this are removed. */
const HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * The holding folder: where a finished video's work files, and old versions, wait for a
 * day in case the user asks for a fix, instead of the computer's Trash, where the user
 * would see them. This removes what has been there for more than a day.
 */
export function purgeHold(olderThan = HOLD_MS) {
  const hold = join(morphHome(), ".hold");
  if (!existsSync(hold)) return;
  for (const name of readdirSync(hold)) {
    const path = join(hold, name);
    try {
      // The time it was moved here: a move changes this time, and leaves the others as they were.
      if (Date.now() - statSync(path).ctimeMs > olderThan) rmSync(path, { recursive: true, force: true });
    } catch {
      // It is gone already.
    }
  }
}
