// Where the MORPH tools live on this computer: one folder, out of sight, the same for
// every session, whatever folder the session was opened in.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
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
