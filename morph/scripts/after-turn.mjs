// Runs when Claude finishes a turn (see hooks/hooks.json). Once a video is finished and
// cleaned up, nothing of the style has to stay on the computer: the style's components
// and its research leave right away, without waiting for the session to close. The next
// get_style brings them again.
//
// A style's downloads leave only after this session was seen working on a video in that
// style, and only when no video of the style is in work any more: it was cleaned up, or
// it was exported a while ago and its work files were left. So the start of an edit,
// before the video's folder exists, removes nothing.

import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { held, readDownloads, removeParts, removeResearch, writeDownloads } from "./downloads.mjs";
import { morphHome } from "./home.mjs";

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
const styleOf = (entry) => entry.style ?? basename(entry.research ? dirname(entry.path) : entry.path);
/** A video that was exported this long ago is finished, also when its work files were left behind. */
const FINISHED_MS = 10 * 60 * 1000;

/** True while a video in a style's folder is in work: it has no final export, or a fresh one. */
async function inWork(video) {
  let newest = 0;
  for (const name of await holds(join(video, "ייצוא"))) {
    if (name.toLowerCase().endsWith(".mp4")) newest = Math.max(newest, (await stat(join(video, "ייצוא", name))).mtimeMs);
  }
  return !newest || Date.now() - newest < FINISHED_MS;
}

/** True while a video of the entry's style is in work. */
async function working(entry) {
  // The videos in work sit in the style's own folder, MORPH/סגנונות עריכה/<style>, and its code in MORPH/כלים/רימושן/src/<style>.
  const style = join(morphHome(), "סגנונות עריכה", styleOf(entry));
  const skip = "מחקר";
  for (const name of (await holds(style)).filter((found) => found !== skip)) {
    if (await inWork(join(style, name))) return true;
  }
  return false;
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
  if (held(staying, entry)) continue;
  if (entry.research) await removeResearch(entry);
  else await removeParts(entry);
}
if (changed || leaving.length) await writeDownloads(staying);
