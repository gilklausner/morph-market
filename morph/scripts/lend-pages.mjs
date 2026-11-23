
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { noteEditing } from "./editing.mjs";
import { morphHome } from "./home.mjs";
import { lendReviewSettings } from "./review-settings.mjs";
import { switchOn } from "./switch.mjs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
}

await noteEditing(input.session_id);
switchOn(input.session_id);

const tools = morphHome();
if (!existsSync(join(tools, "כלים", "בחירת-סגנון", "שרת.py"))) process.exit(0);
await lendReviewSettings(tools, process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), input.session_id ?? "unknown");
