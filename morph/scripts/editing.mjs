
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "editing.json");
const namedFile = folder && join(folder, "named.json");

export const EDITING_MS = 3 * 24 * 60 * 60 * 1000;

async function readList(path) {
  if (!path) return {};
  try {
    const found = JSON.parse(await readFile(path, "utf8"));
    return found && typeof found === "object" && !Array.isArray(found) ? found : {};
  } catch {
    return {};
  }
}

export const readEditing = () => readList(file);

export const readNamed = () => readList(namedFile);

export const startedLately = (sessions, session) => Boolean(session) && Date.now() - new Date(sessions[session] ?? 0).getTime() < EDITING_MS;

async function change(apply, path = file) {
  if (!path) return;
  const sessions = await readList(path);
  const before = JSON.stringify(sessions);
  apply(sessions);
  if (JSON.stringify(sessions) === before) return;
  await mkdir(folder, { recursive: true });
  const fresh = `${path}.${process.pid}`;
  await writeFile(fresh, JSON.stringify(sessions, null, 2));
  await rename(fresh, path);
}

export async function noteEditing(session) {
  if (!session || session === "unknown") return;
  await change((sessions) => {
    sessions[session] = new Date().toISOString();
  });
}

export async function noteNamed(session) {
  if (!session || session === "unknown") return;
  await change((sessions) => {
    sessions[session] ??= new Date().toISOString();
  }, namedFile);
}

export async function forgetEditing(gone = []) {
  for (const path of [file, namedFile]) {
    await change((sessions) => {
      for (const session of Object.keys(sessions)) {
        if (gone.includes(session) || !startedLately(sessions, session)) delete sessions[session];
      }
    }, path);
  }
}
