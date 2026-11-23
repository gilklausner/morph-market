
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
await reportExports();

const downloads = await readDownloads();
const answer = downloads.some((entry) => entry.session === session) ? hebrewAnswer(input) : null;
const finish = () => {
  if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
};
const mine = downloads.filter((entry) => entry.session === session && !entry.review);
if (mine.length) await work();
await switchOffWhenIdle();
finish();

async function work() {
await noteSession(session);

const holds = async (folder) => {
  try {
    return (await readdir(folder)).filter((name) => name !== ".DS_Store");
  } catch {
    return [];
  }
};
const styleOf = (entry) => entry.style ?? basename(entry.research ? dirname(entry.path) : entry.path);
const FINISHED_MS = 60 * 60 * 1000;

async function inWork(video) {
  let newest = 0;
  for (const name of await holds(join(video, "ייצוא"))) {
    if (!name.toLowerCase().endsWith(".mp4") || name.includes("לפני")) continue;
    newest = Math.max(newest, (await stat(join(video, "ייצוא", name))).mtimeMs);
  }
  return !newest || Date.now() - newest < FINISHED_MS;
}

async function working(entry) {
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
  if (held(staying, entry)) continue;
  if (entry.research) await removeResearch(entry);
  else await removeParts(entry);
}
if (seen.length || leaving.length) await settle({ remove: leaving, seen });
if (leaving.length && !staying.some((entry) => !entry.research && !entry.review)) clearBundleCache();
if (leaving.length && !mine.some((entry) => !leaving.includes(entry))) emptyScratch(session);
}
