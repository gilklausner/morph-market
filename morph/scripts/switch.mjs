// The switch: MORPH's own programs (Node, Python, ffmpeg) come first for the commands Claude
// runs only while a video edit is in progress on this computer.
//
// Every session's search path starts with one folder, "כלים/.active" (session-env.sh). Claude
// Code reads the search path once, when a session opens, but looks in its folders anew for
// every command. So the folder is filled when an edit starts (list_styles, get_style), and
// emptied when no edit is in progress on the computer: then "python3", "node" and "ffmpeg", in
// every other conversation the customer has, are the computer's own.
//
//   on    ".active" holds one link for each entry of "כלים/bin": on a Mac a relative link,
//         "../bin/<name>"; on Windows a hard link to the file (no special rights needed there),
//         or a copy where no link can be made. ".active" sits beside "bin", so a shortcut in
//         "bin" that finds its program by its own place ("$(dirname "$0")/../...") finds it from
//         ".active" too. The links are made again every time, so what an update of the tools
//         changed in "bin" comes in.
//   off   what is inside ".active" leaves. Nothing else: never "bin", and never what a link leads to.
//
// An edit is in progress while the plugin's list of downloads holds a style's components, tools
// or research, of any session (downloads.mjs). The settings lent to a session's folder are not
// an edit. Every clean-up that can take an edit off the list ends by switching off when none is
// left (after-turn.mjs, after-helper.mjs, clear-style-code.mjs); the one at a session's start
// also puts right a switch that a crash left on.
//
// The switch never stops a hook: when it cannot be set, the hook goes on as if it was.

import { cpSync, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { readDownloadsNow } from "./downloads.mjs";
import { morphHome } from "./home.mjs";

function places() {
  const tools = join(morphHome(), "כלים");
  return { bin: join(tools, "bin"), active: join(tools, ".active") };
}

const namesIn = (folder) => {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
};

/** Takes one name away: a link leaves, and what it leads to stays. */
const remove = (path) => {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // In use (Windows: a program running from it). It goes the next time.
  }
};

/** True when ".active" is a folder of its own. Anything else of that name, a link or a file, leaves whole. */
function ownFolder(active) {
  try {
    if (lstatSync(active).isDirectory()) return true;
  } catch {
    return false;
  }
  remove(active);
  return false;
}

/** True when `copy` is a copy of `file` made earlier, and the file has not changed since. */
function copied(file, copy) {
  try {
    const [a, b] = [statSync(file), statSync(copy)];
    return a.isFile() && b.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs;
  } catch {
    return false;
  }
}

/** Puts one entry of "bin" in ".active", in place of what was there under its name, at once. */
function lend(bin, active, name) {
  const from = join(bin, name);
  const to = join(active, name);
  const fresh = join(active, `.${name}.${process.pid}`);
  remove(fresh);
  try {
    if (process.platform !== "win32") symlinkSync(join("..", "bin", name), fresh);
    else {
      try {
        linkSync(from, fresh);
      } catch {
        // A drive that has no links: a copy, made again only when the file changed.
        if (copied(from, to)) return;
        cpSync(from, fresh, { recursive: true, preserveTimestamps: true });
      }
    }
    renameSync(fresh, to);
  } catch {
    // In use (Windows), or it cannot be made: what is there stays.
  } finally {
    remove(fresh);
  }
}

/** Fills ".active": MORPH's programs come first for every command, in every session on the computer. */
export function switchOn() {
  try {
    const { bin, active } = places();
    let names = namesIn(bin);
    if (!names.length) return; // The tools are not installed.
    // On Windows the programs are the ".exe" files. A file of the same name without it is the Mac
    // program the kit brings, which the installer removes: an update that is running leaves it there a while.
    if (process.platform === "win32") names = names.filter((name) => !names.includes(`${name}.exe`));
    if (!ownFolder(active)) mkdirSync(active, { recursive: true });
    for (const name of names) lend(bin, active, name);
    // What "bin" no longer has, and a link another run left half made, leaves.
    for (const name of namesIn(active)) if (!names.includes(name)) remove(join(active, name));
  } catch {
    // The edit goes on: the tools name their own programs in full.
  }
}

/** Empties ".active": every command finds the computer's own programs again. */
export function switchOff() {
  try {
    const { active } = places();
    if (!ownFolder(active)) return;
    for (const name of namesIn(active)) remove(join(active, name));
  } catch {
    // It is put right by the next clean-up.
  }
}

/** True while the list of downloads holds an edit: a style's components, tools or research, of any session. */
export const editInProgress = (downloads) => downloads.some((entry) => entry && typeof entry === "object" && !entry.review);

/**
 * Switches off when no edit is in progress on the computer. A list that cannot be read just
 * now (another hook is writing it) leaves the switch as it is.
 */
export async function switchOffWhenIdle() {
  try {
    const downloads = await readDownloadsNow();
    if (downloads && !editInProgress(downloads)) switchOff();
  } catch {
    // The next clean-up looks again.
  }
}
