// A session's own temporary folder. During an edit Claude keeps its passing work files
// there: frames it looked at, small scripts, a file on its way to the export. Nothing in
// it is needed once the video is finished (what a later fix needs waits in the holding
// folder), so the plugin empties it then, and again when the session closes, without
// counting on Claude to do it.
//
// Only the temporary folder of a session that edited with MORPH is ever emptied, so the
// plugin keeps a short list of those sessions in its data folder.

import { readdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "sessions.json");

/** The sessions that edited with MORPH: { <session id>: <when it was last seen editing> }. */
export async function readSessions() {
  if (!file) return {};
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function change(apply) {
  if (!file) return;
  const sessions = await readSessions();
  apply(sessions);
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify(sessions, null, 2));
}

/** Notes that a session is editing with MORPH. */
export async function noteSession(session) {
  const known = (await readSessions())[session];
  // Once an hour is enough: this runs at the end of every turn.
  if (known && Date.now() - new Date(known).getTime() < 60 * 60 * 1000) return;
  await change((sessions) => {
    sessions[session] = new Date().toISOString();
  });
}

export const forgetSessions = (gone) =>
  change((sessions) => {
    for (const session of gone) delete sessions[session];
  });

/** Where Claude keeps the temporary folders of its sessions on this computer. */
function roots() {
  let user = "";
  try {
    user = String(userInfo().uid);
  } catch {
    return [];
  }
  const bases = ["/private/tmp", "/tmp", tmpdir(), process.env.CLAUDE_CODE_TMPDIR].filter(Boolean);
  return [...new Set(bases.map((base) => join(base, `claude-${user}`)))];
}

/** Empties the temporary folder of one session. The folder itself stays. */
export function emptyScratch(session) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(session ?? "")) return;
  for (const root of roots()) {
    let projects = [];
    try {
      projects = readdirSync(root);
    } catch {
      continue;
    }
    for (const project of projects) {
      // <root>/<the folder the session was opened in>/<session id>/scratchpad
      const scratch = join(root, project, session, "scratchpad");
      let names = [];
      try {
        names = readdirSync(scratch);
      } catch {
        continue;
      }
      for (const name of names) {
        try {
          rmSync(join(scratch, name), { recursive: true, force: true });
        } catch {
          // In use right now: the next time takes it.
        }
      }
    }
  }
}
