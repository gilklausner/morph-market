
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readDownloads, removeParts, removeResearch, settle } from "./downloads.mjs";
import { clearBundleCache, morphHome } from "./home.mjs";
import { plainName } from "./places.mjs";
import { switchOffWhenIdle } from "./switch.mjs";

export const REFUSED_FOR_MS = 24 * 60 * 60 * 1000;

const USER_OWN = new Set(["חיתוך", "תמלול", "ייצוא"]);
const RECENT = "שימוש-אחרון.md";

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

async function since() {
  if (!file) return null;
  try {
    const at = Date.parse(JSON.parse(await readFile(file, "utf8")).since);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export async function refused() {
  if (!file) return;
  let first = await since();
  if (first === null || first > Date.now()) {
    first = Date.now();
    await mkdir(data, { recursive: true });
    await writeFile(file, JSON.stringify({ since: new Date(first).toISOString() }));
  }
  if (Date.now() - first >= REFUSED_FOR_MS) await forget();
}

export async function accepted() {
  if (file) await rm(file, { force: true });
}

const namesIn = (folder) => {
  try {
    return readdirSync(folder, { withFileTypes: true }).filter((entry) => plainName(entry.name) && entry.name !== ".DS_Store");
  } catch {
    return [];
  }
};

const remove = (path) => {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
  }
};

export async function forget() {
  const home = morphHome();
  const remotion = join(home, "כלים", "רימושן");

  try {
    const edits = (await readDownloads()).filter((entry) => entry && !entry.review);
    for (const entry of edits) {
      if (entry.research) await removeResearch(entry);
      else await removeParts(entry);
    }
    if (edits.length) await settle({ remove: edits });
  } catch {
  }

  for (const style of namesIn(join(remotion, "src")).filter((entry) => entry.isDirectory())) {
    const folder = join(remotion, "src", style.name);
    for (const part of namesIn(folder)) {
      if (part.name !== "videos") remove(join(folder, part.name));
    }
    for (const video of namesIn(join(folder, "videos"))) remove(join(folder, "videos", video.name));
  }

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

  const root = join(remotion, "src", "Root.tsx");
  try {
    if (existsSync(root) && readFileSync(root, "utf8") !== EMPTY_ROOT) writeFileSync(root, EMPTY_ROOT);
  } catch {
  }

  for (const render of namesIn(join(remotion, "out"))) remove(join(remotion, "out", render.name));
  clearBundleCache();

  await switchOffWhenIdle();
}
