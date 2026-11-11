// This computer's id for MORPH: a random code, made once and kept in the user's home
// folder. A MORPH key works from a limited number of computers, and this is how the
// server tells one computer from another. It says nothing about the computer itself.

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const folder = join(homedir(), ".morph");
const file = join(folder, "device");

export function deviceId() {
  try {
    const id = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(id)) return id;
  } catch {
    // First use on this computer.
  }
  const id = randomBytes(16).toString("hex");
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, `${id}\n`);
  return id;
}
