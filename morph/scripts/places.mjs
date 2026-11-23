
import { isAbsolute, relative, resolve, sep } from "node:path";

export const CODE = ["כלים", "רימושן", "src", null];
export const TOOLS = ["כלים", "רימושן", "scripts"];
export const RESEARCH = ["סגנונות עריכה", null, "מחקר"];

export const plainName = (name) => typeof name === "string" && name !== "" && name !== "." && name !== ".." && !/[\\/\0]/.test(name);

export function placeOf(home, folder, shape) {
  if (typeof folder !== "string" || !folder) return null;
  const target = resolve(home, folder);
  const inside = relative(resolve(home), target);
  if (!inside || isAbsolute(inside)) return null;
  const names = inside.split(sep);
  if (names.length !== shape.length) return null;
  return names.every((name, index) => (shape[index] === null ? plainName(name) : name === shape[index])) ? target : null;
}

export const plainNames = (parts) => Array.isArray(parts) && parts.length > 0 && parts.every(plainName);
