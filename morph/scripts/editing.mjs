// The sessions that started a MORPH edit: they asked the server which styles there are
// (list_styles) or got a style (get_style). Such a session may look through the MORPH folder by
// name while it finds its way, say to the files of a video it fixes, before it got its style;
// the style files themselves still open only once it got the style (guard-style.mjs).
//
// The list lives in the plugin's data folder: { <session id>: <when it was last seen starting> }.
// A session leaves it when it closes, and one not seen starting an edit for days is forgotten
// (clear-style-code.mjs).

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "editing.json");

/** A session not seen starting an edit for this long is forgotten. */
export const EDITING_MS = 3 * 24 * 60 * 60 * 1000;

/** The sessions that started an edit, and when. */
export async function readEditing() {
  if (!file) return {};
  try {
    const found = JSON.parse(await readFile(file, "utf8"));
    return found && typeof found === "object" && !Array.isArray(found) ? found : {};
  } catch {
    return {};
  }
}

/** True when the session started an edit lately. */
export const startedLately = (sessions, session) => Boolean(session) && Date.now() - new Date(sessions[session] ?? 0).getTime() < EDITING_MS;

/** Applies a change to the list as it is on disk now, and writes it whole, so a reader never finds half of it. */
async function change(apply) {
  if (!file) return;
  const sessions = await readEditing();
  const before = JSON.stringify(sessions);
  apply(sessions);
  // Nothing changed: the file is left as it is (this runs whenever a session opens).
  if (JSON.stringify(sessions) === before) return;
  await mkdir(folder, { recursive: true });
  const fresh = `${file}.${process.pid}`;
  await writeFile(fresh, JSON.stringify(sessions, null, 2));
  await rename(fresh, file);
}

/** Notes that a session started a MORPH edit. */
export async function noteEditing(session) {
  if (!session || session === "unknown") return;
  await change((sessions) => {
    sessions[session] = new Date().toISOString();
  });
}

/** Forgets the sessions given, and every session not seen starting an edit for days. */
export async function forgetEditing(gone = []) {
  await change((sessions) => {
    for (const session of Object.keys(sessions)) {
      if (gone.includes(session) || !startedLately(sessions, session)) delete sessions[session];
    }
  });
}
