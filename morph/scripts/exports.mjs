// Tells the MORPH server when a video's final export was made: that is what counts
// against the user's package, once per video. It runs by itself, after every command
// Claude runs during an edit and at the end of every turn (remind.mjs, after-turn.mjs),
// so it does not depend on Claude, and it sees the export before the video is cleaned up.
//
// A video is known by a fingerprint of its raw file and its style, made here: no file
// leaves the computer. The same raw in the same style is the same video however many
// times it is exported, and what was already told is not told again.

import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { deviceId } from "./device.mjs";
import { morphHome } from "./home.mjs";
import { serverAddress } from "./server.mjs";

const folder = process.env.CLAUDE_PLUGIN_DATA;
const file = folder && join(folder, "exports.json");

/** A file that was written to this recently may still be on its way. */
const SETTLED_MS = 5000;
/** After the server could not be reached, it is not tried again for this long. */
const RETRY_MS = 60 * 1000;
const PIECE = 1024 * 1024;

const names = (path) => {
  try {
    return readdirSync(path).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
};

/** The final exports that are ready now: [{ style, video, path }]. The "before" version is not one. */
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
          // It is gone already.
        }
      }
    }
  }
  return found;
}

/** The fingerprint of a video: its raw file (size, start and end) and its style. */
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
    // The raw file is not where it was: the video is known by where it was and how it was cut.
    digest.update(String(cut.source)).update(JSON.stringify(cut.segments ?? []));
  }
  return digest.digest("hex").slice(0, 32);
}

/**
 * The fingerprints of the videos that sit on this computer: the ones in work, and the
 * finished ones that still wait in the holding folder. The server gets them with a
 * request for a style's components: when the user's package is used up, a video that was
 * already exported can still be fixed, and a new one cannot start. A video in the holding
 * folder no longer says which style it was in, so it is named once for every style.
 */
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
      // Nothing is held.
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

/** Tells the server about every finished export it was not told about yet. Never fails. */
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
    // Counting never gets in the way of an edit.
  }
}
