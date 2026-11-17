// Where the MORPH tools live on this computer: one folder, out of sight, the same for
// every session, whatever folder the session was opened in.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

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
  else if (process.platform === "win32") {
    // Windows' own attrib, named in full: Windows looks for a program named without its folder
    // in the current folder first, so an "attrib.exe" put in the folder the session was opened
    // in would run instead.
    const attrib = join(process.env.SystemRoot || "C:\\Windows", "System32", "attrib.exe");
    for (const path of paths) spawnSync(attrib, ["+h", path], { windowsHide: true });
  }
}

/** Folders where another program called bash sits: WSL's in System32, and the shortcuts in WindowsApps. */
const NOT_GIT_BASH = /(^|[\\/])(system32|syswow64|sysnative|windowsapps)([\\/]|$)/i;

/**
 * Git Bash on Windows: the one Claude Code was told about, the usual places, MORPH's own
 * copy, then the Git that the computer's PATH leads to. Never a bare "bash", and never a
 * program from the current folder: Windows looks there first for a bare name, so a
 * "bash.exe" put in the folder the session was opened in would run, and a bare "bash" can
 * also be WSL's, another program of the same name. When there is no Git Bash at all, the
 * answer is MORPH's own copy all the same: what needs it then fails cleanly, and nothing
 * else runs in its place.
 */
export function gitBash() {
  const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const own = join(local, "MORPH-git", "bin", "bash.exe");
  const places = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    join(local, "Programs", "Git", "bin", "bash.exe"),
    own,
  ];
  // The folders on PATH, only those written in full: "." or an empty entry is the current folder.
  const folders = (process.env.PATH ?? "")
    .split(";")
    .map((folder) => folder.replace(/^"(.*)"$/, "$1"))
    .filter((folder) => isAbsolute(folder) && !NOT_GIT_BASH.test(folder));
  // Git for Windows puts its "cmd" folder on PATH, with git.exe in it. Its bash is in "bin", beside it.
  for (const folder of folders) if (existsSync(join(folder, "git.exe"))) places.push(join(folder, "..", "bin", "bash.exe"));
  // Then any other folder on PATH that holds a bash.exe.
  for (const folder of folders) places.push(join(folder, "bash.exe"));
  return places.find((place) => place && isAbsolute(place) && existsSync(place)) ?? own;
}

/**
 * Opens an archive into a folder. True when it opened. On Windows it is opened by the tar
 * of Git Bash, with the paths in its own form: a plain "tar" there reads "C:" as the name
 * of another computer, and the Windows one breaks the Hebrew file names.
 */
export function unpack(archive, folder, flags = "-xf") {
  const opened =
    process.platform === "win32"
      ? spawnSync(gitBash(), ["-lc", `tar ${flags} "$(cygpath -u "$1")" -C "$(cygpath -u "$2")"`, "morph", archive, folder], { windowsHide: true })
      : spawnSync("tar", [flags, archive, "-C", folder]);
  return opened.status === 0;
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

/**
 * Empties the cache Remotion keeps beside its packages. Before a render Remotion packs the
 * video's code, and keeps a worked copy of it there so the next packing is quicker: a copy
 * that holds the style's code too, and that nothing else removes. It goes when a video is
 * finished and no other video is in work; the next render packs from the start.
 */
export function clearBundleCache() {
  try {
    rmSync(join(morphHome(), "כלים", "רימושן", "node_modules", ".cache"), { recursive: true, force: true });
  } catch {
    // In use by a render that is running: it goes at the end of the next video.
  }
}
