
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const folder = join(homedir(), ".morph");
const file = join(folder, "device");

function keepPrivate() {
  if (process.platform === "win32") return;
  try {
    if (statSync(file).mode & 0o077) chmodSync(file, 0o600);
  } catch {
  }
}

export function deviceId() {
  try {
    const id = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(id)) {
      keepPrivate();
      return id;
    }
  } catch {
  }
  const id = randomBytes(16).toString("hex");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${id}\n`, { mode: 0o600 });
  keepPrivate();
  return id;
}
