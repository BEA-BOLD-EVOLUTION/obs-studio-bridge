import express, { type Request, type Response } from "express";
import { OBSWebSocket } from "obs-websocket-js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.CLIPPER_CONTROL_PORT || "8789", 10) || 8789;

type ClipMode = "program" | "viewer";

type ObsTarget = {
  obs: OBSWebSocket;
  url: string;
  password: string;
  connected: boolean;
  connecting?: Promise<void>;
};

function makeTarget(url: string, password: string): ObsTarget {
  const target: ObsTarget = {
    obs: new OBSWebSocket(),
    url,
    password,
    connected: false
  };
  target.obs.on("ConnectionClosed", () => {
    target.connected = false;
  });
  return target;
}

const targets: Record<ClipMode, ObsTarget> = {
  program: makeTarget(
    process.env.OBS_WEBSOCKET_URL?.trim() || "ws://127.0.0.1:4455",
    process.env.OBS_WEBSOCKET_PASSWORD ?? ""
  ),
  viewer: makeTarget(
    process.env.CLIPPER_OBS_WEBSOCKET_URL?.trim() || "ws://127.0.0.1:4456",
    process.env.CLIPPER_OBS_WEBSOCKET_PASSWORD ?? ""
  )
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseMode(value: unknown): ClipMode {
  return value === "viewer" ? "viewer" : "program";
}

async function ensureObs(mode: ClipMode): Promise<ObsTarget> {
  const target = targets[mode];
  if (target.connected) return target;
  if (!target.connecting) {
    target.connecting = target.obs.connect(target.url, target.password, { rpcVersion: 1 })
      .then(() => { target.connected = true; })
      .finally(() => { target.connecting = undefined; });
  }
  await target.connecting;
  return target;
}

async function obsCall(mode: ClipMode, requestType: string, requestData?: Record<string, unknown>): Promise<any> {
  const target = await ensureObs(mode);
  return target.obs.call(requestType as any, requestData as any);
}

function requireNativeDock(req: Request, res: Response): boolean {
  if (req.header("x-obs-creator-assistant") !== "1") {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return false;
  }
  return true;
}

async function statusPayload(mode: ClipMode): Promise<Record<string, unknown>> {
  const [version, replay, scene] = await Promise.all([
    obsCall(mode, "GetVersion"),
    obsCall(mode, "GetReplayBufferStatus"),
    obsCall(mode, "GetCurrentProgramScene")
  ]);
  return {
    ok: true,
    mode,
    connected: true,
    obsWebSocketVersion: version.obsWebSocketVersion,
    replayBufferActive: Boolean(replay.outputActive),
    programSceneName: scene.currentProgramSceneName,
    obsUrl: targets[mode].url
  };
}

export function startClipperControlServer(): void {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));

  app.get("/clipper/status", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    const mode = parseMode(req.query.mode);
    try {
      res.json(await statusPayload(mode));
    } catch (error) {
      res.status(503).json({
        ok: false,
        mode,
        connected: false,
        replayBufferActive: false,
        error: errorMessage(error),
        obsUrl: targets[mode].url
      });
    }
  });

  app.post("/clipper/enable", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    const mode = parseMode(req.body?.mode);
    try {
      const before = await obsCall(mode, "GetReplayBufferStatus");
      if (!Boolean(before.outputActive)) await obsCall(mode, "StartReplayBuffer");
      res.json(await statusPayload(mode));
    } catch (error) {
      res.status(500).json({ ok: false, mode, error: errorMessage(error) });
    }
  });

  app.post("/clipper/save", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    const mode = parseMode(req.body?.mode);
    try {
      const replay = await obsCall(mode, "GetReplayBufferStatus");
      if (!Boolean(replay.outputActive)) {
        res.status(409).json({ ok: false, mode, error: `${mode === "viewer" ? "Viewer" : "Program"} replay buffer is not active.` });
        return;
      }
      await obsCall(mode, "SaveReplayBuffer");
      res.json({
        ok: true,
        mode,
        replaySaved: true,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ ok: false, mode, error: errorMessage(error) });
    }
  });

  app.listen(port, host, () => {
    console.log(`OBS clipping controls listening on http://${host}:${port}`);
  });
}
