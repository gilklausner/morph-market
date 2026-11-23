
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function morphHome() {
  if (process.env.MORPH_HOME) return process.env.MORPH_HOME;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "MORPH");
  return join(homedir(), "Library", "Application Support", "MORPH");
}

export const installed = () => existsSync(join(morphHome(), "כלים", "version"));

export function hide() {
  const home = morphHome();
  if (!existsSync(home)) return;
  const paths = [home, ...readdirSync(home).map((name) => join(home, name))];
  if (process.platform === "darwin") spawnSync("chflags", ["hidden", ...paths]);
  else if (process.platform === "win32") {
    const attrib = join(process.env.SystemRoot || "C:\\Windows", "System32", "attrib.exe");
    for (const path of paths) spawnSync(attrib, ["+h", path], { windowsHide: true });
  }
}

const NOT_GIT_BASH = /(^|[\\/])(system32|syswow64|sysnative|windowsapps)([\\/]|$)/i;

export function gitBash() {
  const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const own = join(local, "MORPH-git", "bin", "bash.exe");
  const places = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    join(local, "Programs", "Git", "bin", "bash.exe"),
    own,
  ];
  const folders = (process.env.PATH ?? "")
    .split(";")
    .map((folder) => folder.replace(/^"(.*)"$/, "$1"))
    .filter((folder) => isAbsolute(folder) && !NOT_GIT_BASH.test(folder));
  for (const folder of folders) if (existsSync(join(folder, "git.exe"))) places.push(join(folder, "..", "bin", "bash.exe"));
  for (const folder of folders) places.push(join(folder, "bash.exe"));
  return places.find((place) => place && isAbsolute(place) && existsSync(place)) ?? own;
}

export function unpack(archive, folder, flags = "-xf") {
  const opened =
    process.platform === "win32"
      ? spawnSync(gitBash(), ["-lc", `tar ${flags} "$(cygpath -u "$1")" -C "$(cygpath -u "$2")"`, "morph", archive, folder], { windowsHide: true })
      : spawnSync("tar", [flags, archive, "-C", folder]);
  return opened.status === 0;
}

const HOLD_MS = 24 * 60 * 60 * 1000;

export function purgeHold(olderThan = HOLD_MS) {
  const hold = join(morphHome(), ".hold");
  if (!existsSync(hold)) return;
  for (const name of readdirSync(hold)) {
    const path = join(hold, name);
    try {
      if (Date.now() - statSync(path).ctimeMs > olderThan) rmSync(path, { recursive: true, force: true });
    } catch {
    }
  }
}

export function clearBundleCache() {
  try {
    rmSync(join(morphHome(), "כלים", "רימושן", "node_modules", ".cache"), { recursive: true, force: true });
  } catch {
  }
}
