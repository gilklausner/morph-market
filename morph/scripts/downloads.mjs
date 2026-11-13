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

/**
 * Notes that a session now uses the parts of a folder. `style` names the style they belong
 * to. A folder that several styles share, like the tools' scripts, is noted once per style.
 */
export async function noteDownload(path, parts, session, style) {
  const same = (entry) => !entry.review && !entry.research && entry.path === path && entry.session === session && (entry.style ?? "") === (style ?? "");
  const downloads = (await readDownloads()).filter((entry) => !same(entry));
  downloads.push({ path, parts, session, ...(style && { style }), at: new Date().toISOString() });
  await writeDownloads(downloads);
}

/** Removes the downloaded parts of a folder from the computer. */
export async function removeParts(entry) {
  for (const part of entry.parts) await rm(join(entry.path, part), { recursive: true, force: true });
}

/** Notes that a session now uses a style's research folder. `keep` names what stays in it. */
export async function noteResearch(path, keep, session, style) {
  const downloads = (await readDownloads()).filter((entry) => !(entry.research && entry.path === path && entry.session === session));
  downloads.push({ path, parts: [], research: true, keep, session, ...(style && { style }), at: new Date().toISOString() });
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
      (other.style ?? "") === (entry.style ?? "") &&
      Date.now() - new Date(other.at).getTime() < HOLD_MS,
  );
}

const keyOf = (entry) => [entry.path, entry.session, entry.review ? "review" : entry.research ? "research" : "code", entry.style ?? ""].join("|");

/**
 * Takes entries off the list, and marks others as seen, on the list as it is on disk right
 * now. A hook that read the list a moment ago, and writes its own copy back, would drop
 * what another hook added in between. So a change is always applied to a fresh read.
 */
export async function settle({ remove = [], seen = [] } = {}) {
  const gone = new Set(remove.map(keyOf));
  const marked = new Set(seen.map(keyOf));
  const now = (await readDownloads()).filter((entry) => !gone.has(keyOf(entry)));
  for (const entry of now) if (marked.has(keyOf(entry))) entry.seen = true;
  await writeDownloads(now);
}
