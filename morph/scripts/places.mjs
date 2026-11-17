// The places the plugin manages inside the MORPH folder, and nothing else.
//
// The server says where a style's components, tools and research go, and the plugin
// replaces and removes what is there. So a place is taken only when it has the shape of
// one of these, whatever the server (or the plugin's own list of downloads) says. A fault
// on the server then cannot reach a user's videos, the tools, or anything outside the
// MORPH folder.

import { isAbsolute, relative, resolve, sep } from "node:path";

/** A style's components: "כלים/רימושן/src/<style>". */
export const CODE = ["כלים", "רימושן", "src", null];
/** The tools that belong to one style: "כלים/רימושן/scripts". */
export const TOOLS = ["כלים", "רימושן", "scripts"];
/** A style's research: "סגנונות עריכה/<style>/מחקר". */
export const RESEARCH = ["סגנונות עריכה", null, "מחקר"];

/** One file or folder name: not empty, not "." or "..", and no way into another folder. */
export const plainName = (name) => typeof name === "string" && name !== "" && name !== "." && name !== ".." && !/[\\/\0]/.test(name);

/**
 * The full path of a folder inside the MORPH folder `home`, when it has the given shape:
 * the names from the MORPH folder down, where a null stands for any one name. Nothing
 * (null) for any other place.
 */
export function placeOf(home, folder, shape) {
  if (typeof folder !== "string" || !folder) return null;
  const target = resolve(home, folder);
  const inside = relative(resolve(home), target);
  if (!inside || isAbsolute(inside)) return null;
  const names = inside.split(sep);
  if (names.length !== shape.length) return null;
  return names.every((name, index) => (shape[index] === null ? plainName(name) : name === shape[index])) ? target : null;
}

/** True when every one of `parts` is a plain name, and there is at least one. */
export const plainNames = (parts) => Array.isArray(parts) && parts.length > 0 && parts.every(plainName);
