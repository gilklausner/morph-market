
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { readDownloads, removeResearch } from "./downloads.mjs";
import { unpack } from "./home.mjs";
import { placeOf, plainName, RESEARCH } from "./places.mjs";
import { download, serverAddress } from "./server.mjs";

const MARKER = ".morph-research.json";
const LOADING_MS = 10 * 60 * 1000;

const [tools, style, folder, version, recent, partCount, owner] = process.argv.slice(2);
const parts = /^\d{1,2}$/.test(partCount ?? "") ? Math.max(1, Number(partCount)) : 1;
const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!key || !tools || !style || !folder || !/^[0-9a-f]{12}$/.test(version ?? "")) process.exit(0);

const target = placeOf(tools, folder, RESEARCH);
if (!target || (recent && !plainName(recent))) process.exit(0);
const marker = join(target, MARKER);
const read = async () => {
  try {
    return JSON.parse(await readFile(marker, "utf8"));
  } catch {
    return null;
  }
};
const write = (state) => writeFile(marker, JSON.stringify({ ...state, at: new Date().toISOString() }));
const inside = (files) =>
  Array.isArray(files) && files.length && files.every((file) => resolve(target, file).startsWith(target + sep)) ? files : null;

const now = await read();
if (now?.state === "ready" && now.version === version && inside(now.files)?.every((file) => existsSync(join(target, file)))) process.exit(0);
if (now?.state === "loading" && !(owner && now.owner === owner) && Date.now() - Date.parse(now.at) < LOADING_MS) process.exit(0);

await mkdir(target, { recursive: true });
await write({ state: "loading" });
const archive = join(tmpdir(), `morph-research-${process.pid}.tar`);
try {
  const list = recent && join(target, recent);
  const own = list && existsSync(list) ? await readFile(list) : null;

  const headers = { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() };
  for (let part = 0; part < parts; part += 1) {
    await download(await serverAddress(`/research/${encodeURIComponent(style)}${part ? `/${part}` : ""}`), headers, archive, { append: part > 0 });
  }
  const unpacked = { status: unpack(archive, tools) ? 0 : 1 };
  if (own) await writeFile(list, own);
  if (unpacked.status !== 0) throw new Error("הקובץ שירד לא נפתח");
  const files = inside((await read())?.files);
  if (!files) throw new Error("הקובץ שירד לא שלם");
  for (const file of (inside(now?.files) ?? []).filter((old) => !files.includes(old) && old !== recent)) {
    await rm(join(target, file), { force: true });
  }
} catch (error) {
  await write({ state: "failed", error: String(error?.message ?? error) });
} finally {
  await rm(archive, { force: true });
}

if (!(await readDownloads()).some((entry) => entry.research && entry.path === target)) {
  await removeResearch({ path: target, keep: [recent].filter(Boolean) });
}
