
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { morphHome } from "./home.mjs";
import { CODE, placeOf, plainName, plainNames, RESEARCH, TOOLS } from "./places.mjs";

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

export async function readDownloadsNow() {
  if (!file) return [];
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return error?.code === "ENOENT" ? [] : null;
  }
  try {
    const downloads = JSON.parse(text);
    return Array.isArray(downloads) ? downloads : null;
  } catch {
    return null;
  }
}

export async function writeDownloads(downloads) {
  if (!file) return;
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify(downloads, null, 2));
}

export async function noteDownload(path, parts, session, style) {
  const same = (entry) => !entry.review && !entry.research && entry.path === path && entry.session === session && (entry.style ?? "") === (style ?? "");
  const downloads = (await readDownloads()).filter((entry) => !same(entry));
  downloads.push({ path, parts, session, ...(style && { style }), at: new Date().toISOString() });
  await writeDownloads(downloads);
}

export async function removeParts(entry) {
  const home = morphHome();
  const folder = placeOf(home, entry.path, CODE) ?? placeOf(home, entry.path, TOOLS);
  if (!folder || !plainNames(entry.parts)) return;
  for (const part of entry.parts) await rm(join(folder, part), { recursive: true, force: true });
}

export async function noteResearch(path, keep, session, style) {
  const downloads = (await readDownloads()).filter((entry) => !(entry.research && entry.path === path && entry.session === session));
  downloads.push({ path, parts: [], research: true, keep, session, ...(style && { style }), at: new Date().toISOString() });
  await writeDownloads(downloads);
}

export async function removeResearch(entry) {
  const folder = placeOf(morphHome(), entry.path, RESEARCH);
  if (!folder) return;
  let names = [];
  try {
    names = await readdir(folder);
  } catch {
    return;
  }
  for (const name of names) {
    if (plainName(name) && !(entry.keep ?? []).includes(name)) await rm(join(folder, name), { recursive: true, force: true });
  }
}

const HOLD_MS = 3 * 60 * 60 * 1000;

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

export async function settle({ remove = [], seen = [] } = {}) {
  const gone = new Set(remove.map(keyOf));
  const marked = new Set(seen.map(keyOf));
  const now = (await readDownloads()).filter((entry) => !gone.has(keyOf(entry)));
  for (const entry of now) if (marked.has(keyOf(entry))) entry.seen = true;
  await writeDownloads(now);
}
