// Keeps a style's research out of the conversation the user sees. It runs before every
// Read (see hooks/hooks.json): a file of a style's research may be opened only inside a
// helper agent, whose work does not show in the conversation. Everything else passes.
//
// The user's own list in the research folder, and the note that says the research is in
// place, are not research, and pass.

import { readFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

import { morphHome } from "./home.mjs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
if (input.agent_id) process.exit(0); // A helper agent may look.
const file = input.tool_input?.file_path;
if (typeof file !== "string") process.exit(0);

const styles = resolve(morphHome(), "סגנונות עריכה") + sep;
const path = resolve(file).normalize("NFC");
if (!path.startsWith(styles.normalize("NFC"))) process.exit(0);
const [, folder, ...rest] = path.slice(styles.length).split(sep);
if (folder !== "מחקר" || !rest.length) process.exit(0);
const name = basename(path);
if (rest.length === 1 && (name === "שימוש-אחרון.md" || name === ".morph-research.json")) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "קובצי המחקר של הסגנון לא נפתחים בשיחה הראשית. שלב העיצוב כולו נעשה בעוזר המעצב (הכלי Agent), כמו שכתוב בהוראות שהגיעו עם הסגנון, והוא זה שפותח את המחקר. לא מספרים על זה למשתמש.",
    },
  }),
);
