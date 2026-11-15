// Called when Claude finishes a turn (by after-turn.mjs, in the same run, so it costs no
// program of its own). A customer is answered in the language they write in. For one who
// writes Hebrew, a message that ends a turn in English is a slip: Claude is sent back once
// to say it again in Hebrew.
//
// It looks only at sessions that are in a MORPH edit, and only at the last message of the
// turn. It never sends Claude back twice in a row, and it leaves alone a user who writes
// in English themself: the transcript is read for that only when a message came out in English.

import { readFileSync } from "node:fs";

/** The last thing Claude wrote to the user in this turn. */
function lastMessage(input) {
  if (typeof input.last_assistant_message === "string") return input.last_assistant_message;
  try {
    const lines = readFileSync(input.transcript_path, "utf8").trimEnd().split("\n");
    for (let i = lines.length - 1; i >= 0 && i > lines.length - 40; i -= 1) {
      const entry = JSON.parse(lines[i]);
      if (entry.type === "user" && typeof entry.message?.content === "string") return ""; // The turn had no message of Claude's.
      if (entry.type !== "assistant") continue;
      const text = (entry.message?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join(" ");
      if (text.trim()) return text;
    }
  } catch {
    // No transcript to read: nothing to check.
  }
  return "";
}

/** What the user typed themself in one piece of a message: nothing when the app wrote the piece in the user's name. */
function ownWords(text) {
  // A reminder of the app can come before the user's words, in the same piece or in a piece of its own.
  const rest = String(text ?? "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ").trim();
  // Notices, a skill's text and a message of another session are not the user's own words.
  if (/^(<|\[|Base directory for this skill|Another Claude session|This session is being continued|Stop hook feedback)/.test(rest)) return "";
  return rest;
}

/** True when the last thing the user typed themself was in English: then Claude answers in English, and nothing is checked. */
function userWritesEnglish(input) {
  let shortEnglish = false;
  try {
    const lines = readFileSync(input.transcript_path, "utf8").trimEnd().split("\n");
    for (let i = lines.length - 1, seen = 0; i >= 0 && seen < 600; i -= 1, seen += 1) {
      if (!lines[i].startsWith('{"') || !lines[i].includes('"user"')) continue;
      const entry = JSON.parse(lines[i]);
      if (entry.type !== "user" || entry.isMeta || entry.isSidechain) continue;
      const content = entry.message?.content;
      const pieces = typeof content === "string" ? [content] : (content ?? []).filter((part) => part.type === "text").map((part) => part.text);
      // The name of a file or a folder is not the user's language: a path, a quoted name, a name with an ending.
      const typed = pieces
        .map(ownWords)
        .filter(Boolean)
        .join(" ")
        .replace(/`[^`]*`/g, " ")
        .replace(/"[^"]*"/g, " ")
        .replace(/\S*[\/\\]\S*/g, " ")
        .replace(/\S+\.[A-Za-z0-9]{2,4}(?=[\s.,!?)]|$)/g, " ");
      const latin = (typed.match(/[A-Za-z]/g) ?? []).length;
      const hebrew = (typed.match(/[\u0590-\u05FF]/g) ?? []).length;
      // Words in Hebrew, even a few, are the user's own: Claude never offers a Hebrew button to a user who writes English.
      if (hebrew >= 3 && latin <= hebrew * 2) return false;
      // A click on a button or a few words in English say too little: the message before them decides,
      // and they decide only when there is none.
      if (latin + hebrew < 25) {
        if (latin >= 3 && hebrew === 0) shortEnglish = true;
        continue;
      }
      return latin > hebrew * 2;
    }
  } catch {
    // No transcript to read: the user is taken to write Hebrew.
    return false;
  }
  return shortEnglish;
}

/**
 * What to answer the end of a turn with when its last message came out in English: an
 * answer that sends Claude back to say it in Hebrew. Nothing when the message is fine,
 * or when Claude was already sent back for this turn.
 */
export function hebrewAnswer(input) {
  if (!input || input.stop_hook_active) return null;
  // Code, commands and paths inside a message are not its language.
  const text = lastMessage(input).replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const hebrew = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  if (latin < 15 || hebrew * 2 >= latin) return null;
  if (userWritesEnglish(input)) return null;
  return {
    decision: "block",
    reason:
      "MORPH: your last message to the user was written in English. The user writes in Hebrew, so every message to them is in Hebrew. " +
      "Write that same message again now, in Hebrew, as one short sentence, with nothing before or after it, and without mentioning this note or the language.",
  };
}
