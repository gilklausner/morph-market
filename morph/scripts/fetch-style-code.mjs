
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { deviceId } from "./device.mjs";
import { held, noteDownload, noteResearch, readDownloads, removeParts, removeResearch, settle } from "./downloads.mjs";
import { noteEditing } from "./editing.mjs";
import { knownVideos } from "./exports.mjs";
import { hide, morphHome } from "./home.mjs";
import { CODE, placeOf, plainName, plainNames, RESEARCH, TOOLS } from "./places.mjs";
import { lendReviewSettings } from "./review-settings.mjs";
import { switchOn } from "./switch.mjs";
import { startUpdate } from "./update-tools.mjs";

function say(note) {
  console.log(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: note } }),
  );
  process.exit(0);
}

const STOP = "לא ממשיכים לבנייה בלי הרכיבים. אומרים למשתמש מה קרה.";

const TALK =
  " Reminder, from the first tool call on: the user is a customer and sees every word. Between tool calls write nothing at all, in any language (no \"Now...\", no \"Let me...\", no note that something is running or already open). The language is the one the user themself writes in: Hebrew, unless the user's own messages are in English. The `description` of every tool call is only the stage name, in that language. For a user who writes Hebrew, every message, also the short one that ends a turn, is in Hebrew and never in English.";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
}
const style = input.tool_input?.style;
if (!style) process.exit(0);

const key = process.env.CLAUDE_PLUGIN_OPTION_MORPH_KEY;
if (!key) process.exit(0);

await noteEditing(input.session_id);

const tools = morphHome();
const sessionFolder = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dirname, "..");
const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
const address = new URL(`/code/${encodeURIComponent(style)}`, mcp.mcpServers.morph.url);

let answer;
try {
  answer = await fetch(address, { headers: { Authorization: `Bearer ${key}`, "X-Morph-Device": deviceId(), "X-Morph-Videos": knownVideos().join(",") } });
} catch {
  say(`הרכיבים של הסגנון לא ירדו: אין חיבור לשרת של MORPH. ${STOP}`);
}
if (answer.status === 401 || answer.status === 404) process.exit(0);
if (answer.status === 403) {
  const refused = await answer.json().catch(() => ({}));
  if (refused.error === "package") {
    say(
      `הרכיבים של הסגנון לא ירדו, כי החבילה של המשתמש נוצלה. סרטון חדש לא מתחילים ולא ממשיכים: אומרים למשתמש רק "${refused.say}", ועוצרים.` +
        (refused.fixes
          ? " אם המשתמש ביקש תיקון בסרטון שכבר יוצא, מחזירים קודם את תיקיית הסרטון למקומה, וקוראים שוב ל־get_style."
          : " גם תיקון לא עושים עד שהחבילה מתחדשת."),
    );
  }
}
if (!answer.ok) say(`הרכיבים של הסגנון לא ירדו: השרת של MORPH ענה ${answer.status}. ${STOP}`);

const code = await answer.json();
const target = placeOf(tools, code.folder, CODE);
if (!target || !plainNames(code.parts) || !Array.isArray(code.files)) {
  say(`הרכיבים של הסגנון לא ירדו: השרת של MORPH מסר להם מקום לא תקין. ${STOP}`);
}
if (!existsSync(dirname(target))) {
  say(
    `הרכיבים של הסגנון לא ירדו: הכלים של MORPH לא מותקנים במחשב הזה. קוראים ל־get_tools ומתקינים לפי מה שחזר. ${STOP}`,
  );
}

if (input.session_id) {
  const downloads = await readDownloads();
  const before = downloads.filter((entry) => entry.session === input.session_id && !entry.review && entry.style && entry.style !== code.name);
  const staying = downloads.filter((entry) => !before.includes(entry));
  for (const entry of before) {
    if (held(staying, entry)) continue;
    if (entry.research) await removeResearch(entry);
    else await removeParts(entry);
  }
  if (before.length) await settle({ remove: before });
}

for (const part of code.parts) await rm(join(target, part), { recursive: true, force: true });
for (const file of code.files) {
  const path = resolve(target, file.path);
  if (!path.startsWith(target + sep)) continue;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.text);
}

spawn(process.execPath, [join(import.meta.dirname, "fetch-sound.mjs"), tools], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
}).unref();

const ownTools = code.tools && placeOf(tools, code.tools.folder, TOOLS);
const toolNames = [];
if (ownTools && existsSync(ownTools)) {
  for (const file of code.tools.files ?? []) {
    const path = resolve(ownTools, file.path);
    if (!plainName(file.path) || dirname(path) !== ownTools) continue;
    await writeFile(path, file.text.replaceAll("/opt/homebrew/bin/", `${join(tools, "כלים", "bin").replaceAll("\\", "/")}/`));
    toolNames.push(file.path);
  }
  if (toolNames.length) await noteDownload(ownTools, toolNames, input.session_id ?? "unknown", code.name);
}

const research = code.research && placeOf(tools, code.research.folder, RESEARCH);
const recentOk = !code.research?.recent || plainName(code.research.recent);
const hasResearch = Boolean(research && recentOk && /^[0-9a-f]{12}$/.test(code.research.version ?? ""));
const researching = hasResearch && Boolean(input.agent_id);
if (researching) {
  await noteResearch(research, [code.research.recent].filter(Boolean), input.session_id ?? "unknown", code.name);
  const note = join(research, ".morph-research.json");
  let now = null;
  try {
    now = JSON.parse(await readFile(note, "utf8"));
  } catch {
  }
  const owner = `${process.pid}-${Date.now()}`;
  const busy = now?.state === "loading" && Date.now() - Date.parse(now.at) < 10 * 60 * 1000;
  if (!busy && !(now?.state === "ready" && now.version === code.research.version)) {
    await mkdir(research, { recursive: true });
    await writeFile(note, JSON.stringify({ state: "loading", owner, at: new Date().toISOString() }));
  }
  spawn(
    process.execPath,
    [
      join(import.meta.dirname, "fetch-research.mjs"),
      tools,
      code.style,
      code.research.folder,
      code.research.version,
      code.research.recent ?? "",
      String(code.research.parts ?? 1),
      owner,
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  ).unref();
}

await lendReviewSettings(tools, sessionFolder, input.session_id ?? "unknown");
hide();

const updating = await startUpdate(tools);

await noteDownload(target, code.parts, input.session_id ?? "unknown", code.name);

switchOn();

say(
  `הרכיבים של הסגנון "${code.name}" ירדו מהשרת אל "${code.folder}": ` +
    `${code.parts.join(", ")} (${code.files.length} קבצים). ` +
    `אלה הקבצים שההוראות קוראות להם הערכה והתבנית. לא משנים אותם, לא מעתיקים אותם ולא מוחקים אותם: הפלאגין מנהל אותם לבד, ומוחק אותם כשהסרטון נוקה.` +
    (toolNames.length ? ` גם הכלים של הסגנון ירדו אל "${code.tools.folder}": ${toolNames.join(", ")}. הפלאגין מנהל גם אותם.` : "") +
    (researching
      ? ` המחקר של הסגנון יורד עכשיו ברקע אל "${code.research.folder}", והפלאגין מוחק אותו לבד. לפני שפותחים אותו קוראים את הקובץ ".morph-research.json" שבתיקייה הזו: כשכתוב בו "state": "ready" ממשיכים, וכשכתוב "loading" מחכים חצי דקה ובודקים שוב, בלי לקרוא שוב ל־get_style. רק כשהוא חסר, או שכתוב "failed", קוראים שוב ל־get_style. לא מעתיקים את המחקר ולא מוחקים אותו.`
      : hasResearch
        ? ` המחקר של הסגנון לא יורד לשיחה הראשית: הוא יורד כשהעוזר המעצב קורא ל־get_style, ונפתח רק אצלו.`
        : "") +
    (updating
      ? ` הכלים של MORPH מתעדכנים עכשיו ברקע. לפני שמריצים כלי כלשהו מחכים שהקובץ "כלים/.morph-update.json" ייעלם: בודקים כל 10 שניות, עד 5 דקות. לא מעדכנים לבד ולא מספרים על זה למשתמש.`
      : "") +
    TALK,
);
