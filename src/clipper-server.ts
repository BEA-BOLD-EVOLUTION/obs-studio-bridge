import express, { type Request, type Response } from "express";
import { OBSWebSocket } from "obs-websocket-js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.CLIPPER_CONTROL_PORT || "8789", 10) || 8789;
const obsUrl = process.env.CLIPPER_OBS_WEBSOCKET_URL?.trim() || "ws://127.0.0.1:4456";
const obsPassword = process.env.CLIPPER_OBS_WEBSOCKET_PASSWORD ?? "";

const obs = new OBSWebSocket();
let connected = false;
let connecting: Promise<void> | undefined;

obs.on("ConnectionClosed", () => {
  connected = false;
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureObs(): Promise<void> {
  if (connected) return;
  if (!connecting) {
    connecting = obs.connect(obsUrl, obsPassword, { rpcVersion: 1 })
      .then(() => { connected = true; })
      .finally(() => { connecting = undefined; });
  }
  await connecting;
}

async function obsCall(requestType: string, requestData?: Record<string, unknown>): Promise<any> {
  await ensureObs();
  return obs.call(requestType as any, requestData as any);
}

function requireNativeDock(req: Request, res: Response): boolean {
  if (req.header("x-obs-creator-assistant") !== "1") {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return false;
  }
  return true;
}

async function statusPayload(): Promise<Record<string, unknown>> {
  const [version, replay, scene] = await Promise.all([
    obsCall("GetVersion"),
    obsCall("GetReplayBufferStatus"),
    obsCall("GetCurrentProgramScene")
  ]);
  return {
    ok: true,
    connected: true,
    obsWebSocketVersion: version.obsWebSocketVersion,
    replayBufferActive: Boolean(replay.outputActive),
    programSceneName: scene.currentProgramSceneName,
    obsUrl
  };
}

export function startClipperControlServer(): void {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));

  app.get("/clipper/status", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    try {
      res.json(await statusPayload());
    } catch (error) {
      res.status(503).json({
        ok: false,
        connected: false,
        replayBufferActive: false,
        error: errorMessage(error),
        obsUrl
      });
    }
  });

  app.post("/clipper/enable", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    try {
      const before = await obsCall("GetReplayBufferStatus");
      if (!Boolean(before.outputActive)) await obsCall("StartReplayBuffer");
      res.json(await statusPayload());
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.post("/clipper/save", async (req, res) => {
    if (!requireNativeDock(req, res)) return;
    try {
      const replay = await obsCall("GetReplayBufferStatus");
      if (!Boolean(replay.outputActive)) {
        res.status(409).json({ ok: false, error: "Clipper replay buffer is not active." });
        return;
      }
      await obsCall("SaveReplayBuffer");
      res.json({
        ok: true,
        replaySaved: true,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.listen(port, host, () => {
    console.log(`OBS Mobile Clipper controls listening on http://${host}:${port}`);
  });
}
