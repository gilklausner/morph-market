// Brings a style's research from the MORPH server, with the user's key, into the style's
// folder in the MORPH folder. fetch-style-code.mjs starts it in the background when
// Claude gets a style that has research, and the plugin removes the research again when
// the session closes (clear-style-code.mjs).
//
//   node fetch-research.mjs <MORPH folder> <style id> <research folder> <version> <list name>
//
// The list of what the user's last videos took from the research belongs to the user: it
// stays in the folder when the research leaves, and a download never replaces it.
//
// The file ".morph-research.json" in the research folder says where things stand:
//   { "state": "loading" }                           the download is running
//   { "state": "ready", "version": "", "files": [] } everything is in place
//   { "state": "failed", "error": "" }

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { readDownloads, removeResearch } from "./downloads.mjs";
import { download, serverAddress } from "./server.mjs";

const MARKER = ".morph-research.json";
/** A download that says it is running for longer than this has died. */
const LOADING_MS = 10 * 60 * 1000;

const [tools, style, folder, version, recent] = process.argv.slice(2);
const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!key || !tools || !style || !folder || !/^[0-9a-f]{12}$/.test(version ?? "")) process.exit(0);

const target = resolve(tools, folder);
if (!target.startsWith(resolve(tools) + sep)) process.exit(0); // Never outside the MORPH folder.
const marker = join(target, MARKER);
const read = async () => {
  try {
    return JSON.parse(await readFile(marker, "utf8"));
  } catch {
    return null;
  }
};
const write = (state) => writeFile(marker, JSON.stringify({ ...state, at: new Date().toISOString() }));
/** The files of a list, when every one of them is inside the research folder. */
const inside = (files) =>
  Array.isArray(files) && files.length && files.every((file) => resolve(target, file).startsWith(target + sep)) ? files : null;

const now = await read();
if (now?.state === "ready" && now.version === version && inside(now.files)?.every((file) => existsSync(join(target, file)))) process.exit(0);
if (now?.state === "loading" && Date.now() - Date.parse(now.at) < LOADING_MS) process.exit(0);

await mkdir(target, { recursive: true });
await write({ state: "loading" });
const archive = join(tmpdir(), `morph-research-${process.pid}.tar`);
try {
  // The user's own list, when there is one: it goes back after the research is unpacked.
  const list = recent && join(target, recent);
  const own = list && existsSync(list) ? await readFile(list) : null;

  await download(await serverAddress(`/research/${encodeURIComponent(style)}`), { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() }, archive);
  // The archive is laid out like the MORPH folder, and its last file is the list of what
  // it holds, which replaces the "loading" note only when everything is in place.
  const unpacked = spawnSync("tar", ["-xf", archive, "-C", tools]);
  if (own) await writeFile(list, own);
  if (unpacked.status !== 0) throw new Error("הקובץ שירד לא נפתח");
  const files = inside((await read())?.files);
  if (!files) throw new Error("הקובץ שירד לא שלם");
  // A file that left the research leaves this computer too.
  for (const file of (inside(now?.files) ?? []).filter((old) => !files.includes(old) && old !== recent)) {
    await rm(join(target, file), { force: true });
  }
} catch (error) {
  await write({ state: "failed", error: String(error?.message ?? error) });
} finally {
  await rm(archive, { force: true });
}

// A session that closed while this was running has nobody left to remove the research.
if (!(await readDownloads()).some((entry) => entry.research && entry.path === target)) {
  await removeResearch({ path: target, keep: [recent].filter(Boolean) });
}
