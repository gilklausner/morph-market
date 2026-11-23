
import { readFileSync } from "node:fs";

import { readDownloads, removeParts, removeResearch, settle } from "./downloads.mjs";
import { forgetEditing } from "./editing.mjs";
import { reportExports } from "./exports.mjs";
import { clearBundleCache, purgeHold } from "./home.mjs";
import { returnReviewSettings } from "./review-settings.mjs";
import { emptyScratch, forgetSessions, readSessions } from "./scratch.mjs";
import { switchOffWhenIdle } from "./switch.mjs";

const STALE_MS = 12 * 60 * 60 * 1000;

const mode = process.argv[2];
let session;
try {
  session = JSON.parse(readFileSync(0, "utf8")).session_id;
} catch {
}

purgeHold();
if (mode === "start") await reportExports();

const downloads = await readDownloads();
const kind = (entry) => (entry.review ? "review" : entry.research ? "research" : "code");
const stale = (entry) => Date.now() - new Date(entry.at).getTime() > STALE_MS;
const leaving = downloads.filter((entry) => (mode === "end" ? entry.session === session : stale(entry)));
const staying = downloads.filter((entry) => !leaving.includes(entry));

for (const entry of leaving) {
  if (staying.some((other) => other.path === entry.path && kind(other) === kind(entry) && (other.style ?? "") === (entry.style ?? "") && !stale(other))) continue;
  if (entry.review) await returnReviewSettings(entry);
  else if (entry.research) await removeResearch(entry);
  else await removeParts(entry);
}
if (leaving.length) await settle({ remove: leaving });
const components = (entry) => !entry.research && !entry.review;
if (leaving.some(components) && !staying.some(components)) clearBundleCache();
await switchOffWhenIdle();

const sessions = await readSessions();
const done = Object.keys(sessions).filter((known) =>
  mode === "end" ? known === session : Date.now() - new Date(sessions[known]).getTime() > STALE_MS && !staying.some((entry) => entry.session === known),
);
for (const known of done) emptyScratch(known);
if (done.length) await forgetSessions(done);

await forgetEditing(mode === "end" && session ? [session] : []);
