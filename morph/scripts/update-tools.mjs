
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
const UPDATING_MS = 20 * 60 * 1000;

const headers = (key) => ({ Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() });

function claudeProgram() {
  if (process.platform === "win32") return "";
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

const IN_WORK_MS = 12 * 60 * 60 * 1000;

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
      if (video === "מחקר") continue;
      const folder = join(styles, style, video);
      if (touched(folder) || list(folder).some((name) => touched(join(folder, name)))) return true;
    }
  }
  return false;
}

export async function startUpdate(tools) {
  const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
  if (!key || !existsSync(join(tools, VERSION))) return false;
  const marker = join(tools, MARKER);
  try {
    const running = JSON.parse(readFileSync(marker, "utf8"));
    if (Date.now() - Date.parse(running.at) < UPDATING_MS) return true;
  } catch {
  }
  if (videoInWork(tools)) return false;

  let current;
  try {
    const answer = await fetch(await serverAddress("/kit/version"), { headers: headers(key), signal: AbortSignal.timeout(4000) });
    if (!answer.ok) return false;
    current = (await answer.text()).trim();
  } catch {
    return false;
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
