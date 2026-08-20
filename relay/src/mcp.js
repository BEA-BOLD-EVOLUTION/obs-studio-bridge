import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { dispatchVirtualCameraCommand } from "./virtual-camera.js";

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const write = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function pairComputer(accessToken, pairingCode) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  const { data, error } = await client.rpc("claim_obs_device_by_code", {
    p_pairing_code_hash: hash(pairingCode)
  });
  if (error) throw error;
  if (!data) throw new Error("That pairing code is incorrect, expired, or ambiguous. Generate a new code on the OBS computer and try again.");
  return { ok: true, deviceId: data, message: "OBS computer paired to this account." };
}

export function createCreatorMcpServer({
  accessToken,
  ownerUserId,
  listDevices,
  dispatchCommand,
  updateDevice,
  saveDualPcPreset,
  listDualPcPresets,
  inspectDualPcReadiness
}) {
  const server = new McpServer({ name: "obs-creator-assistant", version: "0.4.0" });

  server.registerTool("obs_pair_computer", {
    description: "Use this when the creator gives a six-digit pairing code shown by OBS Creator Assistant on their computer. Pair that computer to the signed-in creator account.",
    inputSchema: { pairingCode: z.string().regex(/^\d{6}$/) },
    annotations: write
  }, async ({ pairingCode }) => result(await pairComputer(accessToken, pairingCode)));

  server.registerTool("obs_list_my_computers", {
    description: "Use this when the creator wants to see which OBS computers are linked to their account or whether they are online.",
    inputSchema: {},
    annotations: readOnly
  }, async () => result({ devices: await listDevices(accessToken) }));

  server.registerTool("obs_update_computer", {
    description: "Name a linked OBS computer, assign its Background or Camera/Compositor production role, or make it the default computer. Use listed device IDs only.",
    inputSchema: {
      deviceId: z.string().uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      productionRole: z.enum(["background", "camera_compositor"]).nullable().optional(),
      isDefault: z.boolean().optional()
    },
    annotations: { ...write, idempotentHint: true }
  }, async ({ deviceId, ...input }) => result(await updateDevice(accessToken, deviceId, input)));

  server.registerTool("obs_save_dual_pc_preset", {
    description: "Save or update a reusable two-computer TikTok LIVE Studio production preset after both linked computers have clear roles. TikTok audio remains a separate creator-controlled setup.",
    inputSchema: {
      presetId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(120),
      backgroundDeviceId: z.string().uuid(),
      backgroundSceneName: z.string().trim().min(1).max(120),
      compositorDeviceId: z.string().uuid(),
      compositorSceneName: z.string().trim().min(1).max(120),
      receivingSourceName: z.string().trim().min(1).max(120),
      cameraSourceName: z.string().trim().min(1).max(120).optional(),
      overlaySourceNames: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
      expectedWidth: z.number().int().min(320).max(7680),
      expectedHeight: z.number().int().min(240).max(7680),
      expectedFps: z.number().min(1).max(120),
      tiktokAudioConfiguredSeparately: z.literal(true).describe("Acknowledges that TikTok LIVE Studio audio must be configured and tested separately.")
    },
    annotations: { ...write, idempotentHint: true }
  }, async input => result(await saveDualPcPreset(accessToken, ownerUserId, input)));

  server.registerTool("obs_list_dual_pc_presets", {
    description: "List the authenticated creator's saved two-computer TikTok production presets.",
    inputSchema: {},
    annotations: readOnly
  }, async () => result({ presets: await listDualPcPresets(accessToken) }));

  server.registerTool("obs_inspect_dual_pc_readiness", {
    description: "Read-only preflight for a saved dual-PC preset. Checks ownership, connectivity, scenes, required sources, video settings, and OBS Virtual Camera state without changing OBS or TikTok LIVE Studio.",
    inputSchema: { presetId: z.string().uuid() },
    annotations: readOnly
  }, async ({ presetId }) => result(await inspectDualPcReadiness(accessToken, presetId)));

  server.registerTool("obs_inspect_status", {
    description: "Use this when the creator asks whether OBS is connected, streaming, recording, or ready to use.",
    inputSchema: { deviceId: z.string().uuid().optional() },
    annotations: readOnly
  }, async ({ deviceId }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_inspect_status", arguments: {} })));

  server.registerTool("obs_list_scenes", {
    description: "Use this when the creator wants to inspect their OBS scenes or when another workflow needs scene names first.",
    inputSchema: { deviceId: z.string().uuid().optional() },
    annotations: readOnly
  }, async ({ deviceId }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_list_scenes", arguments: {} })));

  server.registerTool("obs_switch_scene", {
    description: "Use this when the creator asks to switch their current LIVE to a named OBS scene.",
    inputSchema: { deviceId: z.string().uuid().optional(), sceneName: z.string().min(1) },
    annotations: { ...write, idempotentHint: true }
  }, async ({ deviceId, sceneName }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_switch_scene", arguments: { sceneName } })));

  server.registerTool("obs_get_virtual_camera_status", {
    description: "Use this to check whether OBS Virtual Camera is available and active on the selected computer before preparing TikTok LIVE Studio.",
    inputSchema: { deviceId: z.string().uuid().optional() },
    annotations: readOnly
  }, async ({ deviceId }) => result(await dispatchVirtualCameraCommand({
    dispatchCommand,
    accessToken,
    deviceId,
    action: "inspect"
  })));

  server.registerTool("obs_start_virtual_camera", {
    description: "Start OBS Virtual Camera only after the creator explicitly confirms. This prepares the video feed for TikTok LIVE Studio but does not start a TikTok LIVE.",
    inputSchema: {
      deviceId: z.string().uuid().optional(),
      confirmed: z.literal(true).describe("Must be true only after the creator explicitly confirms starting OBS Virtual Camera.")
    },
    annotations: { ...write, idempotentHint: true }
  }, async ({ deviceId, confirmed }) => result(await dispatchVirtualCameraCommand({
    dispatchCommand,
    accessToken,
    deviceId,
    action: "start",
    confirmed
  })));

  server.registerTool("obs_stop_virtual_camera", {
    description: "Stop OBS Virtual Camera only after the creator explicitly confirms TikTok LIVE Studio no longer needs the feed. This does not end a TikTok LIVE.",
    inputSchema: {
      deviceId: z.string().uuid().optional(),
      confirmed: z.literal(true).describe("Must be true only after the creator explicitly confirms stopping OBS Virtual Camera.")
    },
    annotations: { ...write, idempotentHint: true }
  }, async ({ deviceId, confirmed }) => result(await dispatchVirtualCameraCommand({
    dispatchCommand,
    accessToken,
    deviceId,
    action: "stop",
    confirmed
  })));

  server.registerTool("obs_run_ai_transition", {
    description: "Use this for the flagship three-part AI transition: transition-in video, featured AI video, transition-out video, then return to LIVE.",
    inputSchema: {
      deviceId: z.string().uuid().optional(),
      mediaSceneName: z.string().min(1),
      transitionInInput: z.string().min(1),
      aiVideoInput: z.string().min(1),
      transitionOutInput: z.string().min(1),
      timeoutMsPerClip: z.number().int().min(1000).max(600000).optional()
    },
    annotations: write
  }, async ({ deviceId, ...args }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_run_ai_transition", arguments: args })));

  server.registerTool("obs_share_screen_or_window", {
    description: "Use this when the creator wants to share an existing OBS desktop or window capture source, fullscreen or with camera picture-in-picture.",
    inputSchema: {
      deviceId: z.string().uuid().optional(),
      sceneName: z.string().min(1),
      captureSourceName: z.string().min(1),
      layout: z.enum(["fullscreen", "picture_in_picture"]).default("fullscreen"),
      cameraSourceName: z.string().min(1).optional()
    },
    annotations: write
  }, async ({ deviceId, ...args }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_share_capture_source", arguments: args })));

  server.registerTool("obs_run_custom_workflow", {
    description: "Use this when the creator wants a custom multi-step OBS workflow that is not covered by a built-in creator goal.",
    inputSchema: {
      deviceId: z.string().uuid().optional(),
      name: z.string().min(1),
      steps: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      restoreOnComplete: z.boolean().optional(),
      restoreOnFailure: z.boolean().optional()
    },
    annotations: write
  }, async ({ deviceId, ...args }) => result(await dispatchCommand(accessToken, deviceId, { tool: "obs_run_workflow", arguments: args })));

  return server;
}

export async function handleMcpRequest(req, res, dependencies) {
  const server = createCreatorMcpServer(dependencies);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }
}
