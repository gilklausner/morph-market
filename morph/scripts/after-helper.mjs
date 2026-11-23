
import { readFileSync } from "node:fs";

import { held, readDownloads, removeResearch, settle } from "./downloads.mjs";
import { switchOffWhenIdle } from "./switch.mjs";

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
  if (!held(staying, entry)) await removeResearch(entry);
}
await settle({ remove: leaving });
await switchOffWhenIdle();
