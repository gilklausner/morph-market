// Runs when Claude asked the server which styles there are (see hooks/hooks.json): the
// first step of every edit, before a style was chosen. The styles page, where the user
// picks a style, opens from the session's folder by name, so the settings of the tools'
// pages are lent to that folder already here. They are taken back when the session
// closes (clear-style-code.mjs).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { morphHome } from "./home.mjs";
import { lendReviewSettings } from "./review-settings.mjs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No input: nothing to do.
}

const tools = morphHome();
// Tools from before the styles page came have nothing to lend yet: the skill asks with buttons instead.
if (!existsSync(join(tools, "כלים", "בחירת-סגנון", "שרת.py"))) process.exit(0);
await lendReviewSettings(tools, process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), input.session_id ?? "unknown");
