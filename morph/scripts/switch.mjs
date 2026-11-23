
import { cpSync, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { readDownloadsNow } from "./downloads.mjs";
import { morphHome } from "./home.mjs";

function places() {
  const tools = join(morphHome(), "כלים");
  return { bin: join(tools, "bin"), active: join(tools, ".active") };
}

const namesIn = (folder) => {
  try {
    return readdirSync(folder);
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

function ownFolder(active) {
  try {
    if (lstatSync(active).isDirectory()) return true;
  } catch {
    return false;
  }
  remove(active);
  return false;
}

function copied(file, copy) {
  try {
    const [a, b] = [statSync(file), statSync(copy)];
    return a.isFile() && b.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs;
  } catch {
    return false;
  }
}

function lend(bin, active, name) {
  const from = join(bin, name);
  const to = join(active, name);
  const fresh = join(active, `.${name}.${process.pid}`);
  remove(fresh);
  try {
    if (process.platform !== "win32") symlinkSync(join("..", "bin", name), fresh);
    else {
      try {
        linkSync(from, fresh);
      } catch {
        if (copied(from, to)) return;
        cpSync(from, fresh, { recursive: true, preserveTimestamps: true });
      }
    }
    renameSync(fresh, to);
  } catch {
  } finally {
    remove(fresh);
  }
}

export function switchOn() {
  try {
    const { bin, active } = places();
    let names = namesIn(bin);
    if (!names.length) return;
    if (process.platform === "win32") names = names.filter((name) => !names.includes(`${name}.exe`));
    if (!ownFolder(active)) mkdirSync(active, { recursive: true });
    for (const name of names) lend(bin, active, name);
    for (const name of namesIn(active)) if (!names.includes(name)) remove(join(active, name));
  } catch {
  }
}

export function switchOff() {
  try {
    const { active } = places();
    if (!ownFolder(active)) return;
    for (const name of namesIn(active)) remove(join(active, name));
  } catch {
  }
}

export const editInProgress = (downloads) => downloads.some((entry) => entry && typeof entry === "object" && !entry.review);

export async function switchOffWhenIdle() {
  try {
    const downloads = await readDownloadsNow();
    if (downloads && !editInProgress(downloads)) switchOff();
  } catch {
  }
}
