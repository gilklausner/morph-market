// Runs when Claude finishes a turn (see hooks/hooks.json). Once a video is finished and
// cleaned up, nothing of the style has to stay on the computer: the style's components
// and its research leave right away, without waiting for the session to close. The next
// get_style brings them again.
//
// A style's downloads leave only after this session was seen working on a video in that
// style, and only when no video of the style is in work any more: it was cleaned up, or
// it was exported a while ago and its work files were left. So the start of an edit,
// before the video's folder exists, removes nothing.
//
// When the last of a session's downloads leave, the session's own temporary folder is
// emptied too (see scratch.mjs).
//
// At the end of every turn, in every session on the computer, MORPH's own programs stop
// coming first for Claude's commands when no edit is in progress any more (switch.mjs).
//
// The same run also checks that the turn's last message is in the user's language (hebrew.mjs).

import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { held, readDownloads, removeParts, removeResearch, settle } from "./downloads.mjs";
import { clearBundleCache, morphHome, purgeHold } from "./home.mjs";
import { reportExports } from "./exports.mjs";
import { hebrewAnswer } from "./hebrew.mjs";
import { emptyScratch, noteSession } from "./scratch.mjs";
import { switchOffWhenIdle } from "./switch.mjs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const session = input?.session_id;
if (!session) process.exit(0);

purgeHold();
// A final export that no command came after is told to the server here (exports.mjs).
await reportExports();

const downloads = await readDownloads();
// In a session that is in a MORPH edit, for a user who writes Hebrew, a turn that ended in English is said again in Hebrew (hebrew.mjs).
const answer = downloads.some((entry) => entry.session === session) ? hebrewAnswer(input) : null;
/** Ends the run. The answer to the end of the turn, when there is one, is the last thing written. */
const finish = () => {
  if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
};
const mine = downloads.filter((entry) => entry.session === session && !entry.review);
if (mine.length) await work();
await switchOffWhenIdle();
finish();

async function work() {
await noteSession(session);

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
/**
 * A video whose final export is this old is finished, also when its work files were left
 * behind. An hour, and not minutes: on a slow computer the checks that follow the export,
 * and a fix the user asks for right after it, take long, and the style's components and
 * the session's work files are still in use then.
 */
const FINISHED_MS = 60 * 60 * 1000;

/** True while a video in a style's folder is in work: it has no final export, or a fresh one. */
async function inWork(video) {
  let newest = 0;
  for (const name of await holds(join(video, "ייצוא"))) {
    // The "before" version is made at the start of the export. On a slow computer the final file comes
    // an hour later, so the "before" version says nothing about the video being finished.
    if (!name.toLowerCase().endsWith(".mp4") || name.includes("לפני")) continue;
    newest = Math.max(newest, (await stat(join(video, "ייצוא", name))).mtimeMs);
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

const seen = [];
const leaving = [];
for (const style of new Set(mine.map(styleOf))) {
  const entries = mine.filter((entry) => styleOf(entry) === style);
  let busy = false;
  for (const entry of entries) busy ||= await working(entry);
  if (busy) {
    seen.push(...entries.filter((found) => !found.seen));
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
if (seen.length || leaving.length) await settle({ remove: leaving, seen });
// No video of any session is in work any more: the worked copy of the code that Remotion keeps goes too (home.mjs).
if (leaving.length && !staying.some((entry) => !entry.research && !entry.review)) clearBundleCache();
// The video is finished and nothing of this session is in work: its passing work files go too.
if (leaving.length && !mine.some((entry) => !leaving.includes(entry))) emptyScratch(session);
}
