// The review page and the styles page are opened from the folder the session was opened
// in, by name, from that folder's ".claude/launch.json". The tools live elsewhere, so at
// the start of an edit their settings are lent to the session's folder, and taken back
// when the session closes. Settings that belong to the folder itself are never touched.
//
// The customer's own file is never lost. A "launch.json" that cannot be read as settings
// (not JSON, say with a comment in it, or JSON of another shape) is not written at all, and
// nothing is lent to that folder. Taking the settings back removes only what the plugin
// added: its own settings, and the file or the ".claude" folder only when the plugin made
// them. The plugin's list of what it has to take back (downloads.mjs) says which it made.

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { readDownloads, writeDownloads } from "./downloads.mjs";

// The pages the tools open in the browser pane: the review page of each style, and the styles page.
const isReview = (config) => ["/כלים/סקירה/שרת.py", "/כלים/בחירת-סגנון/שרת.py"].some((server) => String((config?.runtimeArgs ?? [""])[0]).endsWith(server));

/**
 * Reads a launch.json. `there` says whether the file is there at all, and `settings` holds
 * what it says, or null when it cannot be read as settings: not JSON, or JSON that is not
 * an object with a list of configurations.
 */
async function readSettings(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return { there: error?.code !== "ENOENT", settings: null };
  }
  try {
    const settings = JSON.parse(text);
    const shaped = settings && typeof settings === "object" && !Array.isArray(settings) && (settings.configurations === undefined || Array.isArray(settings.configurations));
    return { there: true, settings: shaped ? settings : null };
  } catch {
    return { there: true, settings: null };
  }
}

export async function lendReviewSettings(tools, folder, session) {
  if (resolve(folder) === resolve(tools)) return;
  const ours = ((await readSettings(join(tools, ".claude", "launch.json"))).settings?.configurations ?? []).filter(isReview);
  if (!ours.length) return;
  const claude = join(folder, ".claude");
  const file = join(claude, "launch.json");
  const { there, settings } = await readSettings(file);
  // A file of the customer's that cannot be read as settings is never written over.
  if (there && !settings) return;
  // What the plugin makes here, it takes back later. It may have made them already: in an
  // earlier step of this session, or in another session that works in the same folder.
  const lent = (await readDownloads()).filter((entry) => entry.review && entry.path === folder);
  const madeFolder = !existsSync(claude) || lent.some((entry) => entry.madeFolder);
  const madeFile = !there || lent.some((entry) => entry.madeFile);
  const others = (settings?.configurations ?? []).filter((config) => !isReview(config));
  await mkdir(claude, { recursive: true });
  await writeFile(file, JSON.stringify({ ...(settings ?? { version: "0.0.1" }), configurations: [...others, ...ours] }, null, 2));
  const downloads = (await readDownloads()).filter((entry) => !(entry.review && entry.path === folder && entry.session === session));
  downloads.push({ path: folder, parts: [], review: true, madeFile, madeFolder, session, at: new Date().toISOString() });
  await writeDownloads(downloads);
}

/**
 * Takes back what was lent to a folder, by its entry in the plugin's list. An entry from
 * before the list said what the plugin made counts as having made nothing: only the
 * plugin's own settings leave, and the file and the folder stay.
 */
export async function returnReviewSettings(entry) {
  const claude = join(entry.path, ".claude");
  const file = join(claude, "launch.json");
  const { there, settings } = await readSettings(file);
  if (there && !settings) return; // It cannot be read as settings any more: it is left as it is.
  if (settings) {
    const configurations = settings.configurations ?? [];
    const others = configurations.filter((config) => !isReview(config));
    // The file leaves only when the plugin made it, and nothing but the plugin's own is in it.
    const onlyOurs = others.length === 0 && Object.keys(settings).every((name) => name === "version" || name === "configurations");
    if (entry.madeFile && onlyOurs) await rm(file, { force: true });
    else if (others.length < configurations.length) await writeFile(file, JSON.stringify({ ...settings, configurations: others }, null, 2));
  }
  // The ".claude" folder leaves too, only when the plugin made it and nothing else came into it.
  if (entry.madeFolder && existsSync(claude) && (await readdir(claude)).length === 0) await rmdir(claude);
}
