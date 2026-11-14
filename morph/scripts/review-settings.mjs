// The review page and the styles page are opened from the folder the session was opened
// in, by name, from that folder's ".claude/launch.json". The tools live elsewhere, so at
// the start of an edit their settings are lent to the session's folder, and taken back
// when the session closes. Settings that belong to the folder itself are never touched.

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { readDownloads, writeDownloads } from "./downloads.mjs";

// The pages the tools open in the browser pane: the review page of each style, and the styles page.
const isReview = (config) => ["/כלים/סקירה/שרת.py", "/כלים/בחירת-סגנון/שרת.py"].some((server) => String((config.runtimeArgs ?? [""])[0]).endsWith(server));
const read = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
};

export async function lendReviewSettings(tools, folder, session) {
  if (resolve(folder) === resolve(tools)) return;
  const ours = ((await read(join(tools, ".claude", "launch.json")))?.configurations ?? []).filter(isReview);
  if (!ours.length) return;
  const file = join(folder, ".claude", "launch.json");
  const there = (await read(file)) ?? { version: "0.0.1", configurations: [] };
  const others = (there.configurations ?? []).filter((config) => !isReview(config));
  await mkdir(join(folder, ".claude"), { recursive: true });
  await writeFile(file, JSON.stringify({ ...there, configurations: [...others, ...ours] }, null, 2));
  const downloads = (await readDownloads()).filter((entry) => !(entry.review && entry.path === folder && entry.session === session));
  downloads.push({ path: folder, parts: [], review: true, session, at: new Date().toISOString() });
  await writeDownloads(downloads);
}

export async function returnReviewSettings(folder) {
  const file = join(folder, ".claude", "launch.json");
  const there = await read(file);
  if (!there) return;
  const others = (there.configurations ?? []).filter((config) => !isReview(config));
  if (others.length) {
    await writeFile(file, JSON.stringify({ ...there, configurations: others }, null, 2));
    return;
  }
  await rm(file, { force: true });
  // The ".claude" folder leaves too when the settings were all it held.
  const claude = join(folder, ".claude");
  if (existsSync(claude) && (await readdir(claude)).length === 0) await rmdir(claude);
}
