// Runs when Claude finishes a turn (see hooks/hooks.json). Once a video is finished and
// cleaned up, nothing of the style has to stay on the computer: the style's components
// and its research leave right away, without waiting for the session to close. The next
// get_style brings them again.
//
// A style's downloads leave only after this session was seen working on a video in that
// style, and only when no video of the style is left: so the start of an edit, before
// the video's folder exists, removes nothing.

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { readDownloads, removeParts, removeResearch, writeDownloads } from "./downloads.mjs";

let session;
try {
  session = JSON.parse(readFileSync(0, "utf8")).session_id;
} catch {
  process.exit(0);
}
if (!session) process.exit(0);

const downloads = await readDownloads();
const mine = downloads.filter((entry) => entry.session === session && !entry.review);
if (!mine.length) process.exit(0);

/** What a folder holds, apart from what the computer adds by itself. */
const holds = async (folder) => {
  try {
    return (await readdir(folder)).filter((name) => name !== ".DS_Store");
  } catch {
    return [];
  }
};
/** The style an entry belongs to: the name of the style's folder. */
const styleOf = (entry) => basename(entry.research ? dirname(entry.path) : entry.path);
/** True while a video of the entry's style is in work. */
async function working(entry) {
  if (entry.research) return (await holds(dirname(entry.path))).some((name) => name !== basename(entry.path));
  return (await holds(join(entry.path, "videos"))).length > 0;
}

let changed = false;
const leaving = [];
for (const style of new Set(mine.map(styleOf))) {
  const entries = mine.filter((entry) => styleOf(entry) === style);
  let busy = false;
  for (const entry of entries) busy ||= await working(entry);
  if (busy) {
    for (const entry of entries.filter((found) => !found.seen)) {
      entry.seen = true;
      changed = true;
    }
  } else if (entries.every((entry) => entry.seen)) {
    leaving.push(...entries);
  }
}

const staying = downloads.filter((entry) => !leaving.includes(entry));
for (const entry of leaving) {
  // Another session that works in the same style keeps what it downloaded.
  if (staying.some((other) => other.path === entry.path && Boolean(other.research) === Boolean(entry.research) && !other.review)) continue;
  if (entry.research) await removeResearch(entry);
  else await removeParts(entry);
}
if (changed || leaving.length) await writeDownloads(staying);
