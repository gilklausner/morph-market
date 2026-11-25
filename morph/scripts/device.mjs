
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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

function machineId() {
  const run = (program, args) => execFileSync(program, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  try {
    const found =
      process.platform === "darwin"
        ? run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]).match(/"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{36})"/)
        : process.platform === "win32"
          ? run(join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe"), ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid", "/reg:64"]).match(/MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]{36})/)
          : null;
    return found ? found[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

export function newDeviceId() {
  const machine = machineId();
  return machine ? createHash("sha256").update(`morph:${machine}`).digest("hex").slice(0, 32) : randomBytes(16).toString("hex");
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
  const id = newDeviceId();
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${id}\n`, { mode: 0o600 });
  keepPrivate();
  return id;
}
