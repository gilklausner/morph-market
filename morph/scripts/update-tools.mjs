// Keeps the MORPH tools on this computer up to date, without Claude: the plugin asks the
// server which version is current, and when the folder holds another one it downloads
// the tools and runs their installer, in the background.
//
//   node update-tools.mjs start             when a session opens (see hooks/hooks.json); it
//                                           also starts the check of the sound
//   node update-tools.mjs run <tools> ...   the update itself, started by startUpdate
//
// fetch-style-code.mjs calls startUpdate too, whenever a style is asked for. An update starts only
// when no video is in work: at the start of a new video, or when a session opens with nothing in work.
//
// While an update runs, the file "כלים/.morph-update.json" exists in the tools folder.
// An edit waits until it is gone.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { deviceId } from "./device.mjs";
import { gitBash, hide, morphHome, unpack } from "./home.mjs";
import { download, serverAddress } from "./server.mjs";

const MARKER = "כלים/.morph-update.json";
const VERSION = "כלים/version";
/** An update that says it is running for longer than this has died. */
const UPDATING_MS = 20 * 60 * 1000;

const headers = (key) => ({ Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() });

/** The Claude Code program this session runs in, which the installer updates the plugin with. */
function claudeProgram() {
  if (process.platform === "win32") return ""; // The Windows installer looks for it by itself.
  let pid = String(process.pid);
  for (let step = 0; step < 8; step += 1) {
    const parent = spawnSync("ps", ["-o", "ppid=", "-p", pid], { encoding: "utf8", windowsHide: true }).stdout?.trim();
    if (!parent || parent === "1") break;
    const program = spawnSync("ps", ["-o", "comm=", "-p", parent], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
    if (program.endsWith("/claude")) return program;
    pid = parent;
  }
  return "";
}

/** A video that was touched this recently is in work. One that was left behind long ago does not hold updates back. */
const IN_WORK_MS = 12 * 60 * 60 * 1000;

/** True when a video is being edited now: a video's folder, in any style, with something that changed lately. */
export function videoInWork(tools, now = Date.now()) {
  const styles = join(tools, "סגנונות עריכה");
  const list = (folder) => {
    try {
      return readdirSync(folder).filter((name) => !name.startsWith("."));
    } catch {
      return [];
    }
  };
  const touched = (path) => {
    try {
      return now - statSync(path).mtimeMs < IN_WORK_MS;
    } catch {
      return false;
    }
  };
  for (const style of list(styles)) {
    for (const video of list(join(styles, style))) {
      if (video === "מחקר") continue; // The style's research, not a video.
      const folder = join(styles, style, video);
      if (touched(folder) || list(folder).some((name) => touched(join(folder, name)))) return true;
    }
  }
  return false;
}

/**
 * Starts an update when the tools in the folder are not the current ones. Answers true
 * when an update is running (this one or an earlier one), so the caller can tell Claude
 * to wait for it.
 */
export async function startUpdate(tools) {
  const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
  if (!key || !existsSync(join(tools, VERSION))) return false;
  const marker = join(tools, MARKER);
  try {
    const running = JSON.parse(readFileSync(marker, "utf8"));
    if (Date.now() - Date.parse(running.at) < UPDATING_MS) return true;
  } catch {
    // No update is running.
  }
  // Never in the middle of a video: an update replaces the tools while they are being used, and on a
  // slow computer it takes long. It waits for the start of the next video.
  if (videoInWork(tools)) return false;

  let current;
  try {
    const answer = await fetch(await serverAddress("/kit/version"), { headers: headers(key), signal: AbortSignal.timeout(4000) });
    if (!answer.ok) return false;
    current = (await answer.text()).trim();
  } catch {
    return false; // No connection: the edit goes on with the tools that are here.
  }
  const here = readFileSync(join(tools, VERSION), "utf8").trim();
  if (!/^[0-9a-f]{12}$/.test(current) || current === here) return false;

  writeFileSync(marker, JSON.stringify({ state: "updating", from: here, to: current, at: new Date().toISOString() }));
  spawn(process.execPath, [fileURLToPath(import.meta.url), "run", tools, here, claudeProgram()], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
  return true;
}

/** The update itself: the same steps a first install takes, on a folder that has the tools. */
async function run(tools, previous, claude) {
  const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
  const archive = join(tmpdir(), `morph-kit-${process.pid}.tar.gz`);
  const note = async (line) => {
    const folder = process.env.CLAUDE_PLUGIN_DATA;
    if (!folder) return;
    await mkdir(folder, { recursive: true });
    await appendFile(join(folder, "update.log"), `${new Date().toISOString()} ${line}\n`);
  };
  try {
    await download(await serverAddress("/kit"), headers(key), archive);
    // On Windows both run in Git Bash, which this script was started from: its tar keeps the Hebrew file names.
    const windows = process.platform === "win32";
    const bash = gitBash();
    const opened = { status: unpack(archive, tools, "-xzf") ? 0 : 1 };
    if (opened.status !== 0) throw new Error("the archive did not open");
    const installer = spawnSync(windows ? bash : "zsh", [windows ? "כלים/התקנה-windows.sh" : "כלים/התקנה.sh"], {
      cwd: tools,
      encoding: "utf8",
      timeout: UPDATING_MS,
      windowsHide: true,
      env: { ...process.env, ...(claude && { MORPH_CLAUDE: claude }) },
    });
    if (installer.status !== 0) throw new Error(`the installer stopped: ${(installer.stdout ?? "").trim().split("\n").slice(-3).join(" | ")}`);
    await note(`updated ${previous} -> ${readFileSync(join(tools, VERSION), "utf8").trim()}`);
  } catch (error) {
    // The old version number goes back, so the next session tries again.
    if (previous) writeFileSync(join(tools, VERSION), `${previous}\n`);
    await note(`failed: ${error?.message ?? error}`);
  } finally {
    await rm(archive, { force: true });
    await rm(join(tools, MARKER), { force: true });
    hide();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, tools, previous, claude] = process.argv.slice(2);
  if (mode === "run" && tools) await run(tools, previous, claude);
  else if (mode === "start") {
    await startUpdate(morphHome());
    spawn(process.execPath, [join(import.meta.dirname, "fetch-sound.mjs"), morphHome()], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
}
