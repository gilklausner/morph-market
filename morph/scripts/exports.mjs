
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { deviceId } from "./device.mjs";
import { morphHome } from "./home.mjs";
import { serverAddress } from "./server.mjs";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "exports.json");

const SETTLED_MS = 5000;
const RETRY_MS = 60 * 1000;
const PIECE = 1024 * 1024;

const names = (path) => {
  try {
    return readdirSync(path).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
};

function finishedExports() {
  const styles = join(morphHome(), "סגנונות עריכה");
  const found = [];
  for (const style of names(styles)) {
    for (const video of names(join(styles, style))) {
      const exports = join(styles, style, video, "ייצוא");
      for (const name of names(exports)) {
        if (!name.toLowerCase().endsWith(".mp4") || name.includes("לפני")) continue;
        try {
          const made = statSync(join(exports, name));
          if (made.size > PIECE && Date.now() - made.mtimeMs > SETTLED_MS) found.push({ style, video, path: join(styles, style, video) });
        } catch {
        }
      }
    }
  }
  return found;
}

function fingerprint({ style, path }) {
  const digest = createHash("sha256").update(style).update("\n");
  let cut;
  try {
    cut = JSON.parse(readFileSync(join(path, "חיתוך", "רשימה.json"), "utf8"));
  } catch {
    return null;
  }
  try {
    const size = statSync(cut.source).size;
    const raw = openSync(cut.source, "r");
    try {
      const piece = Buffer.alloc(PIECE);
      digest.update(String(size));
      digest.update(piece.subarray(0, readSync(raw, piece, 0, PIECE, 0)));
      digest.update(piece.subarray(0, readSync(raw, piece, 0, PIECE, Math.max(0, size - PIECE))));
    } finally {
      closeSync(raw);
    }
  } catch {
    digest.update(String(cut.source)).update(JSON.stringify(cut.segments ?? []));
  }
  return digest.digest("hex").slice(0, 32);
}

export function knownVideos() {
  const styles = join(morphHome(), "סגנונות עריכה");
  const hold = join(morphHome(), ".hold");
  const found = new Set();
  const add = (style, path) => {
    const video = fingerprint({ style, path });
    if (video) found.add(video);
  };
  for (const style of names(styles)) {
    for (const video of names(join(styles, style))) add(style, join(styles, style, video));
    try {
      for (const held of readdirSync(hold)) add(style, join(hold, held));
    } catch {
    }
  }
  return [...found].slice(0, 80);
}

async function readTold() {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

export async function reportExports() {
  const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
  if (!key || !file) return;
  try {
    const ready = finishedExports();
    if (!ready.length) return;
    const told = await readTold();
    if (told.failed && Date.now() - new Date(told.failed).getTime() < RETRY_MS) return;
    let changed = false;
    for (const made of ready) {
      const video = fingerprint(made);
      if (!video || told[video]) continue;
      changed = true;
      try {
        const answer = await fetch(await serverAddress("/videos/exported"), {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId(), "content-type": "application/json" },
          body: JSON.stringify({ style: made.style, video }),
          signal: AbortSignal.timeout(3000),
        });
        if (!answer.ok) throw new Error(String(answer.status));
        told[video] = new Date().toISOString();
        delete told.failed;
      } catch {
        told.failed = new Date().toISOString();
        break;
      }
    }
    if (changed) {
      await mkdir(folder, { recursive: true });
      await writeFile(file, JSON.stringify(told, null, 2));
    }
  } catch {
  }
}
