// Removes the style components and the style research the plugin downloaded, so they stay
// on the computer only while an edit is going on, and takes back the review page's settings it lent to the
// session's folder. It runs by itself (see hooks/hooks.json):
//
//   node clear-style-code.mjs end     when a session closes: what that session downloaded
//   node clear-style-code.mjs start   when a session opens: leftovers of sessions that
//                                     closed without a chance to clean up
//
// What another session still uses is left alone. The next get_style downloads everything
// again, so an edit that continues later loses nothing.

import { readFileSync } from "node:fs";

import { readDownloads, removeParts, removeResearch, writeDownloads } from "./downloads.mjs";
import { returnReviewSettings } from "./review-settings.mjs";

/** A download nobody touched for this long is a leftover. */
const STALE_MS = 12 * 60 * 60 * 1000;

const mode = process.argv[2];
let session;
try {
  session = JSON.parse(readFileSync(0, "utf8")).session_id;
} catch {
  // No input: only leftovers can be cleared.
}

const downloads = await readDownloads();
const kind = (entry) => (entry.review ? "review" : entry.research ? "research" : "code");
const stale = (entry) => Date.now() - new Date(entry.at).getTime() > STALE_MS;
const leaving = downloads.filter((entry) => (mode === "end" ? entry.session === session : stale(entry)));
const staying = downloads.filter((entry) => !leaving.includes(entry));

for (const entry of leaving) {
  // Another session that still works in the same folder keeps what it downloaded.
  if (staying.some((other) => other.path === entry.path && kind(other) === kind(entry) && !stale(other))) continue;
  if (entry.review) await returnReviewSettings(entry.path);
  else if (entry.research) await removeResearch(entry);
  else await removeParts(entry);
}
if (leaving.length) await writeDownloads(staying);
