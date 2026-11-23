
import { readdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "sessions.json");

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

export async function noteSession(session) {
  const known = (await readSessions())[session];
  if (known && Date.now() - new Date(known).getTime() < 60 * 60 * 1000) return;
  await change((sessions) => {
    sessions[session] = new Date().toISOString();
  });
}

export const forgetSessions = (gone) =>
  change((sessions) => {
    for (const session of gone) delete sessions[session];
  });

function roots() {
  if (process.platform === "win32") return [...new Set([tmpdir(), process.env.CLAUDE_CODE_TMPDIR].filter(Boolean).map((base) => join(base, "claude")))];
  let user = "";
  try {
    user = String(userInfo().uid);
  } catch {
    return [];
  }
  const bases = ["/private/tmp", "/tmp", tmpdir(), process.env.CLAUDE_CODE_TMPDIR].filter(Boolean);
  return [...new Set(bases.map((base) => join(base, `claude-${user}`)))];
}

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
        }
      }
    }
  }
}
