// When the MORPH server no longer takes the user's key (the subscription ended, or the key was
// switched off), nothing that was built from a style stays on the computer. The songs and sound
// effects leave at once (fetch-sound.mjs). The rest leaves a day after the first refusal, so a
// key typed wrong, or a payment put right the same day, costs the user nothing:
//
//   the style's components, its own tools and its research that are still here, of every
//   session. The user's own list in a research folder stays.
//   from the folder of each video that was not finished: everything but the user's cut video,
//   the transcript and an export ("חיתוך", "תמלול", "ייצוא"), so its storyboard and its review
//   versions go. The video's own code goes too, and the list of videos in work ("Root.tsx")
//   starts empty again. The video's media in "public/videos" is the user's, and stays.
//   the review renders ("out"), and the worked copy of the code that Remotion keeps.
//
// Every place here is one of the MORPH folder's own, by its fixed name: none comes from the
// server, which only says that it refuses the key. The holding folder of finished videos
// (".hold") is not touched: it empties itself after a day (home.mjs). An answer that takes the
// key starts the count again.
//
//   refused()    the server refused the key just now (401: not "too many computers")
//   accepted()   the server took the key

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readDownloads, removeParts, removeResearch, settle } from "./downloads.mjs";
import { clearBundleCache, morphHome } from "./home.mjs";
import { plainName } from "./places.mjs";
import { switchOffWhenIdle } from "./switch.mjs";

/** How long the key has to be refused before what was built from a style leaves the computer. */
export const REFUSED_FOR_MS = 24 * 60 * 60 * 1000;

/** What stays in the folder of a video that was not finished: what is the user's own. */
const USER_OWN = new Set(["חיתוך", "תמלול", "ייצוא"]);
/** The user's own list in a research folder. */
const RECENT = "שימוש-אחרון.md";

/**
 * The list of videos in work with no video in it: the text the kit brings (build-kit.py,
 * ROOT_TSX). check-plugin.mjs fails when the two part.
 */
export const EMPTY_ROOT = `import { Composition } from "remotion";

// כל סרטון שבעבודה מקבל כאן שורה משלו, מקוד שיושב ב־src/<שם הסגנון>/videos/<שם הסרטון>.
// מזהה של קומפוזיציה הוא רק באנגלית, ספרות ומקף: שם הסגנון ואחריו שם הסרטון.
export const RemotionRoot: React.FC = () => {
  return (
    <>
    </>
  );
};
`;

const data = process.env.CLAUDE_PLUGIN_DATA;
const file = data && join(data, "refused.json");

/** The time of the first refusal in a row, or null. */
async function since() {
  if (!file) return null;
  try {
    const at = Date.parse(JSON.parse(await readFile(file, "utf8")).since);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/** The server refused the key just now. A day after the first refusal in a row, what was built from a style leaves. */
export async function refused() {
  if (!file) return;
  let first = await since();
  // A first refusal, or a time to come (a clock that was moved back), starts the count now.
  if (first === null || first > Date.now()) {
    first = Date.now();
    await mkdir(data, { recursive: true });
    await writeFile(file, JSON.stringify({ since: new Date(first).toISOString() }));
  }
  if (Date.now() - first >= REFUSED_FOR_MS) await forget();
}

/** The server took the key: the count starts again. */
export async function accepted() {
  if (file) await rm(file, { force: true });
}

/** The names inside a folder, apart from what the computer adds there by itself. */
const namesIn = (folder) => {
  try {
    return readdirSync(folder, { withFileTypes: true }).filter((entry) => plainName(entry.name) && entry.name !== ".DS_Store");
  } catch {
    return [];
  }
};

/** Removes one thing. What cannot be removed now (in use) goes the next time. */
const remove = (path) => {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // The next refusal takes it.
  }
};

/** Takes off the computer everything that was built from a style. Each step goes on when another failed. */
export async function forget() {
  const home = morphHome();
  const remotion = join(home, "כלים", "רימושן");

  // What the plugin downloaded, of every session, and its entries in the list.
  try {
    const edits = (await readDownloads()).filter((entry) => entry && !entry.review);
    for (const entry of edits) {
      if (entry.research) await removeResearch(entry);
      else await removeParts(entry);
    }
    if (edits.length) await settle({ remove: edits });
  } catch {
    // The folders below are cleared all the same.
  }

  // Each style's components, also ones the list no longer knows, and the code of each video.
  for (const style of namesIn(join(remotion, "src")).filter((entry) => entry.isDirectory())) {
    const folder = join(remotion, "src", style.name);
    for (const part of namesIn(folder)) {
      if (part.name !== "videos") remove(join(folder, part.name));
    }
    for (const video of namesIn(join(folder, "videos"))) remove(join(folder, "videos", video.name));
  }

  // Each style's research, but the user's list, and from each video that was not finished all
  // but the user's own.
  const styles = join(home, "סגנונות עריכה");
  for (const style of namesIn(styles).filter((entry) => entry.isDirectory())) {
    for (const video of namesIn(join(styles, style.name)).filter((entry) => entry.isDirectory())) {
      const folder = join(styles, style.name, video.name);
      const keep = video.name === "מחקר" ? new Set([RECENT]) : USER_OWN;
      for (const name of namesIn(folder)) {
        if (!keep.has(name.name)) remove(join(folder, name.name));
      }
    }
  }

  // The list of videos in work names none of them now: no video's code is left for it to name.
  const root = join(remotion, "src", "Root.tsx");
  try {
    if (existsSync(root) && readFileSync(root, "utf8") !== EMPTY_ROOT) writeFileSync(root, EMPTY_ROOT);
  } catch {
    // The next refusal puts it right.
  }

  // The review renders, and the worked copy of the code that Remotion keeps.
  for (const render of namesIn(join(remotion, "out"))) remove(join(remotion, "out", render.name));
  clearBundleCache();

  // No edit is left on the computer: the commands find the computer's own programs again.
  await switchOffWhenIdle();
}
