// Runs right after Claude gets a style from the MORPH server (see hooks/hooks.json).
// It downloads that style's components from the server, with the user's key, and puts
// them in the MORPH tools folder, so Claude never has to type them out.
//
// It reads the hook's input from stdin and answers with one line of JSON: a note that
// Claude sees next to the style it just got.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { noteDownload } from "./downloads.mjs";

/** Tells Claude what happened, and ends. */
function say(note) {
  console.log(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: note } }),
  );
  process.exit(0);
}

const STOP = "לא ממשיכים לבנייה בלי הרכיבים. אומרים למשתמש מה קרה.";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No input: nothing to do.
}
const style = input.tool_input?.style;
if (!style) process.exit(0);

// The key the user typed when they set up the plugin.
const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!key) process.exit(0); // Without a key the server already refused the style itself.

// The tools folder is the folder the session was opened in.
const tools = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

// The server's address is the one the plugin already talks to.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dirname, "..");
const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
const address = new URL(`/code/${encodeURIComponent(style)}`, mcp.mcpServers.morph.url);

let answer;
try {
  answer = await fetch(address, { headers: { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId() } });
} catch {
  say(`הרכיבים של הסגנון לא ירדו: אין חיבור לשרת של MORPH. ${STOP}`);
}
if (answer.status === 401 || answer.status === 404) process.exit(0); // The style itself was refused too.
if (!answer.ok) say(`הרכיבים של הסגנון לא ירדו: השרת של MORPH ענה ${answer.status}. ${STOP}`);

const code = await answer.json();
const target = resolve(tools, code.folder);
if (!existsSync(dirname(target))) {
  say(
    `הרכיבים של הסגנון לא ירדו: בתיקייה "${tools}" אין "${dirname(code.folder)}", ` +
      `כלומר הכלים של MORPH לא מותקנים בה. ${STOP}`,
  );
}

// Each part is replaced whole, so a file the style no longer has does not stay behind.
for (const part of code.parts) await rm(join(target, part), { recursive: true, force: true });
for (const file of code.files) {
  const path = resolve(target, file.path);
  if (!path.startsWith(target + sep)) continue; // Never write outside the style's folder.
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.text);
}

// The plugin removes them again when this session closes (clear-style-code.mjs).
await noteDownload(target, code.parts, input.session_id ?? "unknown");

say(
  `הרכיבים של הסגנון "${code.name}" ירדו מהשרת אל "${code.folder}": ` +
    `${code.parts.join(", ")} (${code.files.length} קבצים). ` +
    `אלה הקבצים שההוראות קוראות להם הערכה והתבנית. לא משנים אותם, לא מעתיקים אותם ולא מוחקים אותם: הפלאגין מנהל אותם לבד.`,
);
