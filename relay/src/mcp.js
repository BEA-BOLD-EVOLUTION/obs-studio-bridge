import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

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

export function createCreatorMcpServer({ accessToken, listDevices, dispatchCommand }) {
  const server = new McpServer({ name: "obs-creator-assistant", version: "0.3.0" });

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
