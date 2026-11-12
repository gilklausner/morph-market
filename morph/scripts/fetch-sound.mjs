// Brings the MORPH songs and sound effects from the server, with the user's key, and puts
// them in the MORPH tools folder. fetch-style-code.mjs starts it in the background at the
// start of an edit, so the sound is in place long before the edit reaches its sound stage:
//
//   node fetch-sound.mjs <tools folder> <session id>
//
// The sound stays on the computer only while an edit is going on: the plugin removes it
// when the session closes (clear-style-code.mjs). Songs the user added are never touched.
//
// The file "סאונד/.morph-sound.json" in the tools folder says where things stand:
//   { "state": "loading" }            the download is running
//   { "state": "ready", "files": [] } everything is in place; the files MORPH brought
//   { "state": "failed", "error": "" }

import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import { deviceId } from "./device.mjs";
import { noteDownload } from "./downloads.mjs";

const MARKER = "סאונד/.morph-sound.json";
/** A download that says it is running for longer than this has died. */
const LOADING_MS = 10 * 60 * 1000;

const [tools, session = "unknown"] = process.argv.slice(2);
const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!tools || !key || !existsSync(join(tools, dirname(MARKER)))) process.exit(0);

const marker = join(tools, MARKER);
const read = async () => {
  try {
    return JSON.parse(await readFile(marker, "utf8"));
  } catch {
    return null;
  }
};
const write = (state) => writeFile(marker, JSON.stringify({ ...state, at: new Date().toISOString() }));
/** The files of a list, when every one of them is inside the tools folder. */
const inside = (files) =>
  Array.isArray(files) && files.length && files.every((file) => resolve(tools, file).startsWith(resolve(tools) + sep)) ? files : null;

/**
 * Downloads a file. Node's plain client, and not fetch: on a file this size fetch is
 * many times slower.
 */
function download(address, headers, target) {
  return new Promise((done, failed) => {
    (address.protocol === "http:" ? http : https)
      .get(address, { headers }, (answer) => {
        if (answer.statusCode !== 200) {
          answer.resume();
          return failed(new Error(`השרת של MORPH ענה ${answer.statusCode}`));
        }
        pipeline(answer, createWriteStream(target)).then(done, failed);
      })
      .on("error", () => failed(new Error("אין חיבור לשרת של MORPH")));
  });
}

const now = await read();
if (now?.state === "ready" && inside(now.files)?.every((file) => existsSync(join(tools, file)))) {
  // Already here, from an earlier edit of this session or from another open session.
  await noteDownload(tools, [...now.files, MARKER], session);
  process.exit(0);
}
if (now?.state === "loading" && Date.now() - Date.parse(now.at) < LOADING_MS) process.exit(0);

await write({ state: "loading" });
const archive = join(tmpdir(), `morph-sound-${process.pid}.tar`);
try {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dirname, "..");
  const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
  await mkdir(dirname(archive), { recursive: true });
  await download(new URL("/sound", mcp.mcpServers.morph.url), { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() }, archive);

  // The archive is laid out like the tools folder, and its last file is the list of
  // what it holds, which replaces the "loading" note only when everything is in place.
  const unpacked = spawnSync("tar", ["-xf", archive, "-C", tools]);
  if (unpacked.status !== 0) throw new Error("הקובץ שירד לא נפתח");
  const files = inside((await read())?.files);
  if (!files) throw new Error("הקובץ שירד לא שלם");
  await noteDownload(tools, [...files, MARKER], session);
} catch (error) {
  await write({ state: "failed", error: String(error?.message ?? error) });
} finally {
  await rm(archive, { force: true });
}
