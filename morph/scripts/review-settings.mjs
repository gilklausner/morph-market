
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { readDownloads, writeDownloads } from "./downloads.mjs";

const isReview = (config) => ["/כלים/סקירה/שרת.py", "/כלים/בחירת-סגנון/שרת.py"].some((server) => String((config?.runtimeArgs ?? [""])[0]).endsWith(server));

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
  if (there && !settings) return;
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

export async function returnReviewSettings(entry) {
  const claude = join(entry.path, ".claude");
  const file = join(claude, "launch.json");
  const { there, settings } = await readSettings(file);
  if (there && !settings) return;
  if (settings) {
    const configurations = settings.configurations ?? [];
    const others = configurations.filter((config) => !isReview(config));
    const onlyOurs = others.length === 0 && Object.keys(settings).every((name) => name === "version" || name === "configurations");
    if (entry.madeFile && onlyOurs) await rm(file, { force: true });
    else if (others.length < configurations.length) await writeFile(file, JSON.stringify({ ...settings, configurations: others }, null, 2));
  }
  if (entry.madeFolder && existsSync(claude) && (await readdir(claude)).length === 0) await rmdir(claude);
}
