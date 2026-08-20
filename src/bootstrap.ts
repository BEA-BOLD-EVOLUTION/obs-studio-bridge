import fs from "node:fs";
import path from "node:path";

const pidPath = path.join(process.cwd(), ".bridge.pid");
fs.writeFileSync(pidPath, String(process.pid), { encoding: "ascii" });

function removePidFile(): void {
  try {
    if (fs.readFileSync(pidPath, "ascii").trim() === String(process.pid)) fs.rmSync(pidPath);
  } catch {}
}

process.once("exit", removePidFile);
process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

await import("./server.js");
const { startRelayClient } = await import("./relay-client.js");
startRelayClient();

