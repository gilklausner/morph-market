// Runs when a helper agent stops (see hooks/hooks.json). A style's research is opened
// only inside a helper, so when the helper stops, the research has no reason to stay on
// the computer: it leaves at once, whether or not the session stays open. A helper that
// goes on later and needs it calls get_style, and the plugin brings it again.
//
// The user's own list in the research folder stays.

import { readFileSync } from "node:fs";

import { held, readDownloads, removeResearch, settle } from "./downloads.mjs";

let session;
try {
  session = JSON.parse(readFileSync(0, "utf8")).session_id;
} catch {
  process.exit(0);
}
if (!session) process.exit(0);

const downloads = await readDownloads();
const leaving = downloads.filter((entry) => entry.research && entry.session === session);
if (!leaving.length) process.exit(0);
const staying = downloads.filter((entry) => !leaving.includes(entry));
for (const entry of leaving) {
  // Another session that is using the same research right now keeps it.
  if (!held(staying, entry)) await removeResearch(entry);
}
await settle({ remove: leaving });
