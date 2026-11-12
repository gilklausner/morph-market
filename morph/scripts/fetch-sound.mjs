// Brings the MORPH songs and sound effects from the server, with the user's key, into the
// MORPH folder, where they stay. It runs in the background when a session opens and at
// the start of every edit, and does something only when there is something to do:
//
//   the sound is not here yet, or the server has a newer one   it comes down
//   the key is no longer active                                the sound is removed
//
// Songs the user added are never touched.
//
// The file "סאונד/.morph-sound.json" in the MORPH folder says where things stand:
//   { "state": "loading" }                           the download is running
//   { "state": "ready", "version": "", "files": [] } everything is in place; the files MORPH brought
//   { "state": "failed", "error": "" }

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { hide, morphHome } from "./home.mjs";
import { download, serverAddress } from "./server.mjs";

const MARKER = "סאונד/.morph-sound.json";
/** A download that says it is running for longer than this has died. */
const LOADING_MS = 10 * 60 * 1000;

const tools = process.argv[2] || morphHome();
const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!key || !existsSync(join(tools, dirname(MARKER)))) process.exit(0);

const marker = join(tools, MARKER);
const read = async () => {
  try {
    return JSON.parse(await readFile(marker, "utf8"));
  } catch {
    return null;
  }
};
const write = (state) => writeFile(marker, JSON.stringify({ ...state, at: new Date().toISOString() }));
/** The files of a list, when every one of them is inside the MORPH folder. */
const inside = (files) =>
  Array.isArray(files) && files.length && files.every((file) => resolve(tools, file).startsWith(resolve(tools) + sep)) ? files : null;
const remove = async (files) => {
  for (const file of inside(files) ?? []) await rm(join(tools, file), { force: true });
};
const headers = { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() };

const now = await read();
let answer;
try {
  answer = await fetch(await serverAddress("/sound/version"), { headers, signal: AbortSignal.timeout(4000) });
} catch {
  process.exit(0); // No connection: what is here stays as it is.
}
if (answer.status === 401 || answer.status === 403) {
  // The key is no longer active: the sound MORPH brought leaves the computer.
  await remove(now?.files);
  await rm(marker, { force: true });
  process.exit(0);
}
const version = answer.ok ? (await answer.text()).trim() : "";
if (!/^[0-9a-f]{12}$/.test(version)) process.exit(0);
if (now?.state === "ready" && now.version === version && inside(now.files)?.every((file) => existsSync(join(tools, file)))) process.exit(0);
if (now?.state === "loading" && Date.now() - Date.parse(now.at) < LOADING_MS) process.exit(0);

await write({ state: "loading" });
const archive = join(tmpdir(), `morph-sound-${process.pid}.tar`);
try {
  await mkdir(dirname(archive), { recursive: true });
  await download(await serverAddress("/sound"), headers, archive);

  // The archive is laid out like the MORPH folder, and its last file is the list of
  // what it holds, which replaces the "loading" note only when everything is in place.
  const unpacked = spawnSync("tar", ["-xf", archive, "-C", tools]);
  if (unpacked.status !== 0) throw new Error("הקובץ שירד לא נפתח");
  const files = inside((await read())?.files);
  if (!files) throw new Error("הקובץ שירד לא שלם");
  // A song that left the customers' library leaves this computer too.
  await remove((inside(now?.files) ?? []).filter((file) => !files.includes(file)));
  hide();
} catch (error) {
  await write({ state: "failed", error: String(error?.message ?? error) });
} finally {
  await rm(archive, { force: true });
}
