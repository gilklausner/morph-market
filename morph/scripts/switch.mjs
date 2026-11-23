
import { cpSync, linkSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { readDownloadsNow } from "./downloads.mjs";
import { morphHome } from "./home.mjs";

const SESSION = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const OWN = /^\.active-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

function places(session) {
  const tools = join(morphHome(), "כלים");
  return {
    tools,
    bin: join(tools, "bin"),
    active: join(tools, ".active"),
    own: SESSION.test(String(session ?? "")) ? join(tools, `.active-${session}`) : null,
  };
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

function fill(bin, active) {
  let names = namesIn(bin);
  if (!names.length) return;
  if (process.platform === "win32") names = names.filter((name) => !names.includes(`${name}.exe`));
  if (!ownFolder(active)) mkdirSync(active, { recursive: true });
  for (const name of names) lend(bin, active, name);
  for (const name of namesIn(active)) if (!names.includes(name)) remove(join(active, name));
}

export function switchOn(session) {
  const { bin, active, own } = places(session);
  for (const folder of [own, active]) {
    if (!folder) continue;
    try {
      fill(bin, folder);
    } catch {
    }
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

function switchOffBut(sessions) {
  try {
    const { tools } = places();
    const keep = new Set(sessions.map((session) => String(session).toLowerCase()));
    for (const name of namesIn(tools)) {
      const found = name.match(OWN);
      if (found && !keep.has(found[1].toLowerCase())) remove(join(tools, name));
    }
  } catch {
  }
}

export const editInProgress = (downloads) => downloads.some((entry) => entry && typeof entry === "object" && !entry.review);

export const editingSessions = (downloads) => [
  ...new Set(downloads.filter((entry) => entry && typeof entry === "object" && !entry.review && typeof entry.session === "string").map((entry) => entry.session)),
];

export async function switchOffWhenIdle() {
  try {
    const downloads = await readDownloadsNow();
    if (!downloads) return;
    switchOffBut(editingSessions(downloads));
    if (!editInProgress(downloads)) switchOff();
  } catch {
  }
}
