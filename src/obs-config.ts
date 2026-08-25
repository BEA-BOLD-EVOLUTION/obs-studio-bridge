import crypto from "node:crypto";
import fs from "node:fs";

export type ObsWebSocketConfiguration = {
  url: string;
  password: string;
  configured: boolean;
  changed: boolean;
};

export function ensureObsWebSocketConfiguration(configPath: string, allowChanges = true): ObsWebSocketConfiguration {
  const fallback = { url: "ws://127.0.0.1:4455", password: "", configured: false, changed: false };
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch { return fallback; }

  const port = validPort(config.server_port) ?? 4455;
  let changed = false;
  if (allowChanges && config.server_enabled !== true) {
    config.server_enabled = true;
    changed = true;
  }

  const authRequired = config.auth_required !== false;
  let password = typeof config.server_password === "string" ? config.server_password : "";
  if (allowChanges && authRequired && !password) {
    password = crypto.randomBytes(32).toString("base64url");
    config.server_password = password;
    config.auth_required = true;
    changed = true;
  }

  if (changed) {
    const temporary = `${configPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, configPath);
  }
  return { url: `ws://127.0.0.1:${port}`, password, configured: true, changed };
}

function validPort(value: unknown): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}
