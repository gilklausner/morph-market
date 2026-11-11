// Prints the header that tells the MORPH server which computer a connection comes from.
// Claude Code runs it each time it connects to the server (see .mcp.json).
import { deviceId } from "./device.mjs";

console.log(JSON.stringify({ "X-Morph-Device": deviceId() }));
