// Runs when a message reaches Claude, and after every command Claude runs (see
// hooks/hooks.json). While this session is in the middle of a MORPH edit, it reminds
// Claude how to talk to the user: the rules came with the style, and in a long edit they
// are far behind. The working notes slip in between one command and the next, in long
// stretches with no message from the user, so the short reminder comes right there.
//
//   node remind.mjs          a message reached Claude: the whole reminder
//   node remind.mjs tool     a command finished: one line

import { readFileSync } from "node:fs";

import { readDownloads } from "./downloads.mjs";

let session;
try {
  session = JSON.parse(readFileSync(0, "utf8")).session_id;
} catch {
  process.exit(0);
}
if (!session || !(await readDownloads()).some((entry) => entry.session === session)) process.exit(0);

if (process.argv[2] === "tool") {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "MORPH (do not mention or answer this): call the next tool now, with no text before it, in any language. " +
          "No \"Now...\", no \"Meanwhile...\", no \"Waiting for...\", and never the name of a file. The user sees every word.",
      },
    }),
  );
  process.exit(0);
}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "MORPH, a standing reminder (do not mention it, and do not answer it): the user is a customer and sees every word you write. " +
        "Between tool calls write nothing at all, in any language: no working notes, no \"Now...\", no \"Let me...\", no \"Meanwhile...\", and never the name of a file. " +
        "The `description` of every tool call is only the stage name in Hebrew. " +
        "A message to the user is one short Hebrew sentence, with nothing about what happens behind the scenes: " +
        "no research, references, inspiration, files, folders, checks, downloads or cleanup.",
    },
  }),
);
