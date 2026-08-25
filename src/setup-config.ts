import fs from "node:fs";
import path from "node:path";

export type ClipMode = "program" | "viewer" | "both";
export type ViewerCaptureMethod = "airplay" | "software_mirroring" | "hardware_capture" | "other_obs_source";

export type CreatorSetup = {
  version: 1;
  setupComplete: boolean;
  clipMode: ClipMode;
  viewerCaptureMethod: ViewerCaptureMethod | null;
  viewerObsUrl: string;
  viewerSourceName: string;
  updatedAt: string | null;
};

export const defaultCreatorSetup: CreatorSetup = {
  version: 1,
  setupComplete: false,
  clipMode: "program",
  viewerCaptureMethod: null,
  viewerObsUrl: "ws://127.0.0.1:4456",
  viewerSourceName: "",
  updatedAt: null
};

export function creatorSetupPath(root = process.cwd()): string {
  return path.join(root, "config", "creator-settings.json");
}

export function readCreatorSetup(root = process.cwd()): CreatorSetup {
  try {
    const parsed = JSON.parse(fs.readFileSync(creatorSetupPath(root), "utf8")) as unknown;
    return validateCreatorSetup(parsed);
  } catch {
    return { ...defaultCreatorSetup };
  }
}

export function writeCreatorSetup(value: unknown, root = process.cwd()): CreatorSetup {
  const config = validateCreatorSetup(value);
  const saved = { ...config, setupComplete: true, updatedAt: new Date().toISOString() };
  const destination = creatorSetupPath(root);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, destination);
  return saved;
}

export function validateCreatorSetup(value: unknown): CreatorSetup {
  if (!value || typeof value !== "object") throw new Error("Setup choices are missing.");
  const input = value as Record<string, unknown>;
  const clipMode = input.clipMode;
  if (clipMode !== "program" && clipMode !== "viewer" && clipMode !== "both") {
    throw new Error("Choose Program View, Viewer View, or Both.");
  }

  const capture = input.viewerCaptureMethod ?? null;
  const allowedCapture = capture === "airplay" || capture === "software_mirroring" ||
    capture === "hardware_capture" || capture === "other_obs_source";
  if (clipMode !== "program" && !allowedCapture) {
    throw new Error("Choose how the viewer phone appears in OBS.");
  }

  const viewerObsUrl = typeof input.viewerObsUrl === "string" && input.viewerObsUrl.trim()
    ? input.viewerObsUrl.trim()
    : defaultCreatorSetup.viewerObsUrl;
  assertLocalObsUrl(viewerObsUrl);

  const viewerSourceName = typeof input.viewerSourceName === "string" ? input.viewerSourceName.trim() : "";
  if (viewerSourceName.length > 200) throw new Error("The OBS source name is too long.");

  return {
    version: 1,
    setupComplete: input.setupComplete === true,
    clipMode,
    viewerCaptureMethod: allowedCapture ? capture : null,
    viewerObsUrl,
    viewerSourceName,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null
  };
}

function assertLocalObsUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("The Viewer OBS connection address is invalid."); }
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "ws:" || !localHost || !url.port) {
    throw new Error("Viewer OBS must use a local ws:// connection with a port.");
  }
}
