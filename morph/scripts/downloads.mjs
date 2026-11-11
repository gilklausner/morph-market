// The plugin's own list of what it downloaded: which style folders, for which session,
// and when. The list lives in the plugin's data folder, outside the tools folder, so the
// plugin can remove what it brought without anyone asking it to.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "downloads.json");

export async function readDownloads() {
  if (!file) return [];
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
}

export async function writeDownloads(downloads) {
  if (!file) return;
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify(downloads, null, 2));
}

/** Notes that a session now uses the parts of a style folder. */
export async function noteDownload(path, parts, session) {
  const downloads = (await readDownloads()).filter((entry) => !(entry.path === path && entry.session === session));
  downloads.push({ path, parts, session, at: new Date().toISOString() });
  await writeDownloads(downloads);
}

/** Removes the downloaded parts of a style folder from the computer. */
export async function removeParts(entry) {
  for (const part of entry.parts) await rm(join(entry.path, part), { recursive: true, force: true });
}
