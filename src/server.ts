import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { OBSWebSocket } from "obs-websocket-js";
import { z } from "zod";
import { inspectAudioInput, setAudioInputMuted, setAudioInputVolume } from "./audio-controls.js";
import { inspectVirtualCamera, setVirtualCameraActive } from "./output-controls.js";
import { inspectProductionResources } from "./production-readiness.js";
import { setProgramScene, setSceneSourceVisibility } from "./scene-controls.js";
import { registerWorkflowTools } from "./workflows.js";
import { readCreatorSetup } from "./setup-config.js";

const host = "127.0.0.1";
const port = parseInteger(process.env.BRIDGE_PORT, 8787);
const obsUrl = process.env.OBS_WEBSOCKET_URL?.trim() || "ws://127.0.0.1:4455";
const obsPassword = process.env.OBS_WEBSOCKET_PASSWORD ?? "";
const bridgeToken = process.env.BRIDGE_AUTH_TOKEN?.trim() ?? "";

if (bridgeToken.length < 32) {
  throw new Error("BRIDGE_AUTH_TOKEN must contain at least 32 characters.");
}

const obs = new OBSWebSocket();
let obsConnected = false;
let connecting: Promise<void> | undefined;

obs.on("ConnectionClosed", () => {
  obsConnected = false;
});

async function ensureObs(): Promise<void> {
  if (obsConnected) return;
  if (!connecting) {
    connecting = obs.connect(obsUrl, obsPassword, { rpcVersion: 1 })
      .then(() => { obsConnected = true; })
      .finally(() => { connecting = undefined; });
  }
  await connecting;
}

async function obsCall(requestType: string, requestData?: Record<string, unknown>): Promise<any> {
  await ensureObs();
  return obs.call(requestType as any, requestData as any);
}

async function optionalObsCall(requestType: string): Promise<unknown> {
  try {
    return await obsCall(requestType);
  } catch (error) {
    return { unavailable: errorMessage(error) };
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function safeTokenMatch(candidate: string): boolean {
  const expected = Buffer.from(bridgeToken);
  const supplied = Buffer.from(candidate);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function authorize(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !safeTokenMatch(match[1] ?? "")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "obs-studio-bridge", version: "1.1.0" });

  server.registerTool("obs_inspect_status", {
    description: "Inspect OBS version plus stream, recording, and replay-buffer status.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result({
    version: await obsCall("GetVersion"),
    stream: await obsCall("GetStreamStatus"),
    recording: await obsCall("GetRecordStatus"),
    replayBuffer: await optionalObsCall("GetReplayBufferStatus"),
    virtualCamera: await optionalObsCall("GetVirtualCamStatus")
  }));

  server.registerTool("obs_list_scenes", {
    description: "List OBS scenes and identify the current program and preview scenes.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result(await obsCall("GetSceneList")));

  server.registerTool("obs_list_sources", {
    description: "List sources in an OBS scene, including visibility and transform metadata.",
    inputSchema: { sceneName: z.string().min(1).optional() },
    annotations: readOnlyAnnotations
  }, async ({ sceneName }) => {
    const resolvedScene = sceneName ?? (await obsCall("GetCurrentProgramScene")).currentProgramSceneName;
    return result({ sceneName: resolvedScene, ...(await obsCall("GetSceneItemList", { sceneName: resolvedScene })) });
  });

  server.registerTool("obs_list_audio_inputs", {
    description: "List OBS inputs and include mute and volume details where the input supports audio.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => {
    const inputList = await obsCall("GetInputList");
    const inputs = await Promise.all((inputList.inputs ?? []).map(async (input: any) => {
      try {
        const [mute, volume] = await Promise.all([
          obsCall("GetInputMute", { inputName: input.inputName }),
          obsCall("GetInputVolume", { inputName: input.inputName })
        ]);
        return { ...input, ...mute, ...volume };
      } catch {
        return null;
      }
    }));
    return result({ inputs: inputs.filter(Boolean) });
  });

  server.registerTool("obs_inspect_audio_input", {
    description: "Inspect mute and volume state for one existing OBS audio input.",
    inputSchema: { inputName: z.string().min(1).max(120) },
    annotations: readOnlyAnnotations
  }, async ({ inputName }) => result(await inspectAudioInput(obsCall, inputName)));

  server.registerTool("obs_get_video_settings", {
    description: "Inspect OBS base/output resolution, frame rate, and video format settings.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result(await obsCall("GetVideoSettings")));

  server.registerTool("obs_get_performance_stats", {
    description: "Inspect OBS CPU, memory, FPS, render lag, and encoding lag statistics.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result(await obsCall("GetStats")));

  server.registerTool("obs_inspect_production_resources", {
    description: "Read-only validation of a named scene, its required sources, OBS video settings, and Virtual Camera state for a production readiness check.",
    inputSchema: {
      sceneName: z.string().min(1).max(120),
      sourceNames: z.array(z.string().min(1).max(120)).max(24).optional()
    },
    annotations: readOnlyAnnotations
  }, async ({ sceneName, sourceNames }) => result(await inspectProductionResources(obsCall, { sceneName, sourceNames })));

  server.registerTool("obs_diagnose_performance", {
    description: "Diagnose dropped frames, render lag, encoding lag, and stream congestion.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => {
    const stats = await obsCall("GetStats");
    const stream = await obsCall("GetStreamStatus");
    const renderLagPercent = percent(stats.renderSkippedFrames, stats.renderTotalFrames);
    const encodingLagPercent = percent(stats.outputSkippedFrames, stats.outputTotalFrames);
    const congestionPercent = Number(stream.outputCongestion ?? 0) * 100;
    const findings: string[] = [];
    if (renderLagPercent >= 1) findings.push("Render lag is elevated; reduce GPU load or scene complexity.");
    if (encodingLagPercent >= 1) findings.push("Encoding lag is elevated; lower encoder load or use a hardware encoder.");
    if (congestionPercent >= 5) findings.push("Network congestion is elevated; check upload stability or lower bitrate.");
    if (Number(stats.activeFps ?? 0) > 0 && Number(stats.activeFps) < 0.95 * Number(stats.averageFrameRenderTime ? 1000 / stats.averageFrameRenderTime : 0)) {
      findings.push("Active FPS is below the render-time-derived target.");
    }
    if (findings.length === 0) findings.push("No material render, encoding, or congestion issue is visible in the current snapshot.");
    return result({ renderLagPercent, encodingLagPercent, congestionPercent, findings, stats, stream });
  });

  server.registerTool("obs_get_virtual_camera_status", {
    description: "Inspect whether OBS Virtual Camera is available and active. Use this before preparing TikTok LIVE Studio.",
    inputSchema: {},
    annotations: readOnlyAnnotations
  }, async () => result(await inspectVirtualCamera(obsCall)));

  server.registerTool("obs_start_virtual_camera", {
    description: "Start OBS Virtual Camera after the creator explicitly confirms. This prepares the OBS video feed but does not start a TikTok LIVE.",
    inputSchema: {},
    annotations: writeAnnotations
  }, async () => result(await setVirtualCameraActive(obsCall, true)));

  server.registerTool("obs_stop_virtual_camera", {
    description: "Stop OBS Virtual Camera after the creator explicitly confirms that TikTok LIVE Studio no longer needs the feed. This does not end a TikTok LIVE.",
    inputSchema: {},
    annotations: writeAnnotations
  }, async () => result(await setVirtualCameraActive(obsCall, false)));

  server.registerTool("obs_switch_scene", {
    description: "Switch the current OBS program scene.",
    inputSchema: { sceneName: z.string().min(1) },
    annotations: writeAnnotations
  }, async ({ sceneName }) => {
    return result(await setProgramScene(obsCall, sceneName));
  });

  server.registerTool("obs_set_source_visibility", {
    description: "Show or hide a named source in a specific OBS scene.",
    inputSchema: {
      sceneName: z.string().min(1),
      sourceName: z.string().min(1),
      visible: z.boolean()
    },
    annotations: writeAnnotations
  }, async ({ sceneName, sourceName, visible }) => {
    return result(await setSceneSourceVisibility(obsCall, sceneName, sourceName, visible));
  });

  server.registerTool("obs_set_input_mute", {
    description: "Mute or unmute a named OBS audio input.",
    inputSchema: { inputName: z.string().min(1), muted: z.boolean() },
    annotations: writeAnnotations
  }, async ({ inputName, muted }) => {
    return result(await setAudioInputMuted(obsCall, inputName, muted));
  });

  server.registerTool("obs_set_input_volume", {
    description: "Set a named OBS audio input volume in decibels.",
    inputSchema: { inputName: z.string().min(1), volumeDb: z.number().min(-100).max(26) },
    annotations: writeAnnotations
  }, async ({ inputName, volumeDb }) => {
    return result(await setAudioInputVolume(obsCall, inputName, volumeDb));
  });

  registerOutputControl(server, "obs_start_streaming", "StartStream", "GetStreamStatus", true, "streaming");
  registerOutputControl(server, "obs_stop_streaming", "StopStream", "GetStreamStatus", false, "streaming");
  registerOutputControl(server, "obs_start_recording", "StartRecord", "GetRecordStatus", true, "recording");
  registerOutputControl(server, "obs_stop_recording", "StopRecord", "GetRecordStatus", false, "recording");

  server.registerTool("obs_save_replay_buffer", {
    description: "Save the currently buffered replay in OBS.",
    inputSchema: {},
    annotations: writeAnnotations
  }, async () => {
    await obsCall("SaveReplayBuffer");
    return result({ ok: true, replaySaved: true });
  });

  registerWorkflowTools(server, obsCall);

  return server;
}

function registerOutputControl(
  server: McpServer,
  toolName: string,
  requestType: string,
  statusRequestType: string,
  targetActive: boolean,
  label: string
): void {
  server.registerTool(toolName, {
    description: `${targetActive ? "Start" : "Stop"} OBS ${label}.`,
    inputSchema: {},
    annotations: writeAnnotations
  }, async () => {
    const before = await obsCall(statusRequestType);
    if (Boolean(before.outputActive) === targetActive) {
      return result({ ok: true, changed: false, message: `${label} was already ${targetActive ? "active" : "inactive"}.` });
    }
    const response = await obsCall(requestType);
    return result({ ok: true, changed: true, response });
  });
}

function percent(skipped: unknown, total: unknown): number {
  const numerator = Number(skipped ?? 0);
  const denominator = Number(total ?? 0);
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(3)) : 0;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    await ensureObs();
    const version = await obsCall("GetVersion");
    res.json({
      ok: true,
      obsConnected: true,
      setupComplete: readCreatorSetup().setupComplete,
      obsWebSocketVersion: version.obsWebSocketVersion
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      obsConnected: false,
      setupComplete: readCreatorSetup().setupComplete,
      error: errorMessage(error)
    });
  }
});

app.all("/mcp", authorize, async (req, res) => {
  if (req.method === "POST" && !isInitializeRequest(req.body)) {
    // Stateless requests remain supported; initialization is not stored server-side.
  }
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed", detail: errorMessage(error) });
  }
});

app.listen(port, host, () => {
  console.log(`OBS MCP bridge listening on http://${host}:${port}`);
  console.log(`Health: http://${host}:${port}/health`);
  console.log(`MCP: http://${host}:${port}/mcp`);
});
