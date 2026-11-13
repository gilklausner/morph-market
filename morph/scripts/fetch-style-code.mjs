// Runs right after Claude gets a style from the MORPH server (see hooks/hooks.json).
// It downloads that style's components from the server, with the user's key, and puts
// them in the MORPH tools folder, so Claude never has to type them out.
//
// It also starts the download of the style's research when it has one (fetch-research.mjs),
// lends the review page's settings to the session's folder, checks the MORPH songs and
// sound effects (fetch-sound.mjs) and checks the tools' version (update-tools.mjs).
//
// It reads the hook's input from stdin and answers with one line of JSON: a note that
// Claude sees next to the style it just got.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { noteDownload, noteResearch } from "./downloads.mjs";
import { hide, morphHome } from "./home.mjs";
import { lendReviewSettings } from "./review-settings.mjs";
import { startUpdate } from "./update-tools.mjs";

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

// The tools live in the MORPH folder, whatever folder the session was opened in.
const tools = morphHome();
const sessionFolder = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

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
    `הרכיבים של הסגנון לא ירדו: הכלים של MORPH לא מותקנים במחשב הזה. קוראים ל־get_tools ומתקינים לפי מה שחזר. ${STOP}`,
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

// The songs and sound effects: a check in the background, which downloads them when they are missing or changed.
spawn(process.execPath, [join(import.meta.dirname, "fetch-sound.mjs"), tools], {
  detached: true,
  stdio: "ignore",
}).unref();

// A style with research: it comes down in the background, and leaves when the session closes.
const research = code.research && resolve(tools, code.research.folder);
const researching = Boolean(research && research.startsWith(resolve(tools) + sep) && /^[0-9a-f]{12}$/.test(code.research.version ?? ""));
if (researching) {
  await noteResearch(research, [code.research.recent].filter(Boolean), input.session_id ?? "unknown");
  spawn(
    process.execPath,
    [join(import.meta.dirname, "fetch-research.mjs"), tools, code.style, code.research.folder, code.research.version, code.research.recent ?? ""],
    { detached: true, stdio: "ignore" },
  ).unref();
}

// The review page opens from the session's folder, so its settings are lent to it.
await lendReviewSettings(tools, sessionFolder, input.session_id ?? "unknown");
hide();

// The tools themselves: when the server has a newer version, it comes down in the background.
const updating = await startUpdate(tools);

// The plugin removes them again when this session closes (clear-style-code.mjs).
await noteDownload(target, code.parts, input.session_id ?? "unknown");

say(
  `הרכיבים של הסגנון "${code.name}" ירדו מהשרת אל "${code.folder}": ` +
    `${code.parts.join(", ")} (${code.files.length} קבצים). ` +
    `אלה הקבצים שההוראות קוראות להם הערכה והתבנית. לא משנים אותם, לא מעתיקים אותם ולא מוחקים אותם: הפלאגין מנהל אותם לבד, ומוחק אותם כשהסרטון נוקה.` +
    (researching
      ? ` המחקר של הסגנון יורד עכשיו ברקע אל "${code.research.folder}", והפלאגין מוחק אותו לבד. הוא נפתח רק בתוך העוזר המעצב, ולא בשיחה הראשית. לפני שפותחים אותו קוראים את הקובץ ".morph-research.json" שבתיקייה הזו: כשכתוב בו "state": "ready" ממשיכים, כשכתוב "loading" מחכים חצי דקה ובודקים שוב, וכשהוא חסר או שכתוב "failed" קוראים שוב ל־get_style. לא מעתיקים את המחקר ולא מוחקים אותו.`
      : "") +
    (updating
      ? ` הכלים של MORPH מתעדכנים עכשיו ברקע. לפני שמריצים כלי כלשהו מחכים שהקובץ "כלים/.morph-update.json" ייעלם: בודקים כל 10 שניות, עד 5 דקות. לא מעדכנים לבד ולא מספרים על זה למשתמש.`
      : ""),
);
