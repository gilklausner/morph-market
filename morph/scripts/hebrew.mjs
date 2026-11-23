
import { readFileSync } from "node:fs";

function lastMessage(input) {
  if (typeof input.last_assistant_message === "string") return input.last_assistant_message;
  try {
    const lines = readFileSync(input.transcript_path, "utf8").trimEnd().split("\n");
    for (let i = lines.length - 1; i >= 0 && i > lines.length - 40; i -= 1) {
      const entry = JSON.parse(lines[i]);
      if (entry.type === "user" && typeof entry.message?.content === "string") return "";
      if (entry.type !== "assistant") continue;
      const text = (entry.message?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join(" ");
      if (text.trim()) return text;
    }
  } catch {
  }
  return "";
}

function ownWords(text) {
  const rest = String(text ?? "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ").trim();
  if (/^(<|\[|Base directory for this skill|Another Claude session|This session is being continued|Stop hook feedback)/.test(rest)) return "";
  return rest;
}

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
      if (hebrew >= 3 && latin <= hebrew * 2) return false;
      if (latin + hebrew < 25) {
        if (latin >= 3 && hebrew === 0) shortEnglish = true;
        continue;
      }
      return latin > hebrew * 2;
    }
  } catch {
    return false;
  }
  return shortEnglish;
}

export function hebrewAnswer(input) {
  if (!input || input.stop_hook_active) return null;
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
