// How the plugin's scripts reach the MORPH server: its address, and a download that
// copes with big files.

import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

/** An address on the server the plugin already talks to. */
export async function serverAddress(path) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(import.meta.dirname, "..");
  const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
  return new URL(path, mcp.mcpServers.morph.url);
}

/**
 * Downloads a file. Node's plain client, and not fetch: on a big file fetch is many
 * times slower. With `append` it goes on at the end of a file that is already there,
 * which is how a download that comes in parts is joined back.
 */
export function download(address, headers, target, { append = false } = {}) {
  return new Promise((done, failed) => {
    (address.protocol === "http:" ? http : https)
      .get(address, { headers }, (answer) => {
        if (answer.statusCode !== 200) {
          answer.resume();
          return failed(new Error(`השרת של MORPH ענה ${answer.statusCode}`));
        }
        pipeline(answer, createWriteStream(target, { flags: append ? "a" : "w" })).then(done, failed);
      })
      .on("error", () => failed(new Error("אין חיבור לשרת של MORPH")));
  });
}
