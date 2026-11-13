// The plugin's own list of what it has to take back: which folders (a style's components,
// a style's research, or a session's folder that was lent the review page's settings), for
// which session, and when. The list lives in the plugin's data folder, outside the tools folder, so the
// plugin can remove what it brought without anyone asking it to.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

/** Notes that a session now uses the parts of a folder. */
export async function noteDownload(path, parts, session) {
  const downloads = (await readDownloads()).filter((entry) => entry.review || !(entry.path === path && entry.session === session));
  downloads.push({ path, parts, session, at: new Date().toISOString() });
  await writeDownloads(downloads);
}

/** Removes the downloaded parts of a folder from the computer. */
export async function removeParts(entry) {
  for (const part of entry.parts) await rm(join(entry.path, part), { recursive: true, force: true });
}

/** Notes that a session now uses a style's research folder. `keep` names what stays in it. */
export async function noteResearch(path, keep, session) {
  const downloads = (await readDownloads()).filter((entry) => !(entry.research && entry.path === path && entry.session === session));
  downloads.push({ path, parts: [], research: true, keep, session, at: new Date().toISOString() });
  await writeDownloads(downloads);
}

/** Removes a style's research from the computer, apart from what belongs to the user. */
export async function removeResearch(entry) {
  let names = [];
  try {
    names = await readdir(entry.path);
  } catch {
    return; // The folder is not there.
  }
  for (const name of names) {
    if (!(entry.keep ?? []).includes(name)) await rm(join(entry.path, name), { recursive: true, force: true });
  }
}

/** A session that noted a download longer ago than this no longer holds it for the others. */
const HOLD_MS = 3 * 60 * 60 * 1000;

/** True when one of the other entries still holds the same download as `entry`. */
export function held(others, entry) {
  return others.some(
    (other) =>
      other.path === entry.path &&
      !other.review &&
      Boolean(other.research) === Boolean(entry.research) &&
      Date.now() - new Date(other.at).getTime() < HOLD_MS,
  );
}
