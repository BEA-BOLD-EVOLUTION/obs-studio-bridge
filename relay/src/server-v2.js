import crypto from "node:crypto";
import express from "express";
import { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { handleMcpRequest } from "./mcp.js";
import {
  evaluateInspection,
  inspectionCommand,
  presetRecord,
  publicPreset,
  readinessSummary,
  toolPayload
} from "./dual-pc.js";
import { startCoordinatedProduction, stopCoordinatedProduction } from "./production-coordinator.js";
import { inspectProductionHealth } from "./production-health.js";
import { updateCoordinatedProduction } from "./production-update.js";

const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://relay-production-bbb4.up.railway.app").replace(/\/$/, "");

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const liveDevices = new Map();
const pendingCommands = new Map();

function randomId(bytes = 18) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function userClient(accessToken) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

function sendUnauthorized(res, message = "Authentication required") {
  const metadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata=\"${metadataUrl}\"`);
  return res.status(401).json({ error: message });
}

async function requireUser(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") || "");
  if (!match) return sendUnauthorized(res);

  const accessToken = match[1];
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return sendUnauthorized(res, "Invalid or expired access token");

  req.obsAccessToken = accessToken;
  req.obsUser = data.user;
  next();
}

async function listDevices(accessToken) {
  const client = userClient(accessToken);
  const { data, error } = await client
    .from("obs_devices")
    .select("id, device_name, production_role, is_default, paired_at, last_seen_at, revoked_at, created_at")
    .is("revoked_at", null)
    .not("owner_user_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(device => ({
    id: device.id,
    name: device.device_name,
    productionRole: device.production_role,
    isDefault: device.is_default,
    pairedAt: device.paired_at,
    lastSeenAt: device.last_seen_at,
    online: liveDevices.has(device.id)
  }));
}

async function getDevice(accessToken, deviceId) {
  const client = userClient(accessToken);
  const { data, error } = await client
    .from("obs_devices")
    .select("id, device_name, production_role, is_default, paired_at, last_seen_at, revoked_at")
    .eq("id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateDevice(accessToken, deviceId, input) {
  const existing = await getDevice(accessToken, deviceId);
  if (!existing) throw new Error("That OBS computer is not linked to this account.");
  const client = userClient(accessToken);
  const changes = {};
  if (input.name !== undefined) changes.device_name = input.name.trim();
  if (input.productionRole !== undefined) changes.production_role = input.productionRole;
  if (input.isDefault !== undefined) changes.is_default = input.isDefault;
  if (Object.keys(changes).length === 0) throw new Error("Provide a name, production role, or default-computer setting to update.");

  if (changes.is_default === true) {
    const { error: clearError } = await client.from("obs_devices").update({ is_default: false }).neq("id", deviceId);
    if (clearError) throw clearError;
  }

  const { data, error } = await client
    .from("obs_devices")
    .update(changes)
    .eq("id", deviceId)
    .select("id, device_name, production_role, is_default")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.device_name,
    productionRole: data.production_role,
    isDefault: data.is_default
  };
}

async function saveDualPcPreset(accessToken, ownerUserId, input) {
  const [background, compositor] = await Promise.all([
    getDevice(accessToken, input.backgroundDeviceId),
    getDevice(accessToken, input.compositorDeviceId)
  ]);
  if (!background || !compositor) throw new Error("Every computer in the preset must be linked to this account.");
  if (background.production_role !== "background") throw new Error("Assign the Background role to the selected background computer first.");
  if (compositor.production_role !== "camera_compositor") throw new Error("Assign the Camera/Compositor role to the selected compositor computer first.");

  const client = userClient(accessToken);
  const record = { owner_user_id: ownerUserId, ...presetRecord(input), updated_at: new Date().toISOString() };
  const query = input.presetId
    ? client.from("obs_dual_pc_presets").update(record).eq("id", input.presetId)
    : client.from("obs_dual_pc_presets").insert(record);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return publicPreset(data);
}

async function listDualPcPresets(accessToken) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_presets").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(publicPreset);
}

async function getDualPcPreset(accessToken, presetId) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_presets").select("*").eq("id", presetId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That dual-PC preset does not belong to this account or no longer exists.");
  return publicPreset(data);
}

async function inspectDualPcReadiness(accessToken, presetId, { allowDisabledSources = false } = {}) {
  const preset = await getDualPcPreset(accessToken, presetId);
  const [backgroundDevice, compositorDevice] = await Promise.all([
    getDevice(accessToken, preset.backgroundDeviceId),
    getDevice(accessToken, preset.compositorDeviceId)
  ]);
  if (!backgroundDevice || !compositorDevice) throw new Error("A computer saved in this preset is no longer linked to this account.");

  const compositorSources = [preset.receivingSourceName, preset.cameraSourceName, ...preset.overlaySourceNames].filter(Boolean);
  const checks = await Promise.allSettled([
    dispatchCommand(accessToken, preset.backgroundDeviceId, inspectionCommand(preset.backgroundSceneName)),
    dispatchCommand(accessToken, preset.compositorDeviceId, inspectionCommand(preset.compositorSceneName, compositorSources))
  ]);
  const expected = { width: preset.expectedWidth, height: preset.expectedHeight, fps: preset.expectedFps };
  const background = readinessDeviceResult(checks[0], {
    role: "background",
    device: publicDevice(backgroundDevice),
    expected: { ...expected, sceneName: preset.backgroundSceneName },
    requiredSources: []
  });
  const compositor = readinessDeviceResult(checks[1], {
    role: "camera_compositor",
    device: publicDevice(compositorDevice),
    expected: { ...expected, sceneName: preset.compositorSceneName },
    requiredSources: compositorSources,
    allowDisabledSources
  });
  return {
    preset,
    summary: readinessSummary(background, compositor, preset.tiktokAudioConfiguredSeparately),
    devices: { background, compositor }
  };
}

async function createProductionSession(accessToken, ownerUserId, preset, capturedState) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_sessions").insert({
    owner_user_id: ownerUserId,
    preset_id: preset.id,
    background_device_id: preset.backgroundDeviceId,
    compositor_device_id: preset.compositorDeviceId,
    status: "preparing",
    captured_state: capturedState,
    completed_steps: [],
    restoration_steps: []
  }).select("*").single();
  if (error?.code === "23505") throw new Error("This preset or one of its computers already has an active or unresolved production session.");
  if (error) throw error;
  return publicSession(data);
}

async function updateProductionSession(accessToken, sessionId, changes) {
  const client = userClient(accessToken);
  const record = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) record.status = changes.status;
  if (changes.completedSteps !== undefined) record.completed_steps = changes.completedSteps;
  if (changes.restorationSteps !== undefined) record.restoration_steps = changes.restorationSteps;
  if (changes.readinessSnapshot !== undefined) record.readiness_snapshot = changes.readinessSnapshot;
  if (changes.errorSummary !== undefined) record.error_summary = changes.errorSummary;
  if (changes.stoppedAt !== undefined) record.stopped_at = changes.stoppedAt;
  const { data, error } = await client.from("obs_dual_pc_sessions").update(record).eq("id", sessionId).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That production session does not belong to this account.");
  return publicSession(data);
}

async function getProductionSession(accessToken, sessionId) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That production session does not belong to this account or no longer exists.");
  return publicSession(data);
}

async function listProductionSessions(accessToken) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_sessions").select("*").order("created_at", { ascending: false }).limit(25);
  if (error) throw error;
  return (data || []).map(publicSession);
}

async function inspectDualPcSessionHealth(accessToken, sessionId) {
  const session = await getProductionSession(accessToken, sessionId);
  if (["stopped", "restored_after_failure"].includes(session.status)) {
    throw new Error("That production session has ended. Start a new session before checking live production health.");
  }
  const preset = await getDualPcPreset(accessToken, session.presetId);
  return inspectProductionHealth({
    accessToken,
    session,
    expectedFps: preset.expectedFps,
    dispatchCommand
  });
}

async function updateDualPcProduction(accessToken, sessionId, input) {
  const session = await getProductionSession(accessToken, sessionId);
  return updateCoordinatedProduction({
    accessToken,
    session,
    ...input,
    dispatchCommand,
    inspectTarget: async (deviceId, sceneName, sourceNames) => toolPayload(
      await dispatchCommand(accessToken, deviceId, inspectionCommand(sceneName, sourceNames))
    ),
    updateSession: (id, changes) => updateProductionSession(accessToken, id, changes)
  });
}

async function getUnresolvedSessionForPreset(accessToken, presetId) {
  const client = userClient(accessToken);
  const { data, error } = await client.from("obs_dual_pc_sessions")
    .select("*")
    .eq("preset_id", presetId)
    .in("status", ["preparing", "active", "stopping", "restore_failed"])
    .maybeSingle();
  if (error) throw error;
  return data ? publicSession(data) : null;
}

async function startDualPcProduction(accessToken, ownerUserId, presetId, confirmed) {
  const existing = await getUnresolvedSessionForPreset(accessToken, presetId);
  if (existing?.status === "active") {
    return {
      ok: true,
      changed: false,
      sessionId: existing.id,
      status: "active",
      readiness: existing.readinessSnapshot,
      message: "This dual-PC production is already active. OBS Creator Assistant did not repeat any changes."
    };
  }
  if (existing) throw new Error(`This preset already has a '${existing.status}' session. Restore or resolve session ${existing.id} before starting again.`);
  const preset = await getDualPcPreset(accessToken, presetId);
  const readiness = await inspectDualPcReadiness(accessToken, presetId, { allowDisabledSources: true });
  return startCoordinatedProduction({
    accessToken,
    preset,
    readiness,
    confirmed,
    dispatchCommand,
    createSession: capturedState => createProductionSession(accessToken, ownerUserId, preset, capturedState),
    updateSession: (sessionId, changes) => updateProductionSession(accessToken, sessionId, changes),
    inspectReadiness: () => inspectDualPcReadiness(accessToken, presetId)
  });
}

async function stopDualPcProduction(accessToken, sessionId, confirmed) {
  const session = await getProductionSession(accessToken, sessionId);
  return stopCoordinatedProduction({
    accessToken,
    session,
    confirmed,
    dispatchCommand,
    updateSession: (id, changes) => updateProductionSession(accessToken, id, changes)
  });
}

function publicSession(row) {
  return {
    id: row.id,
    presetId: row.preset_id,
    backgroundDeviceId: row.background_device_id,
    compositorDeviceId: row.compositor_device_id,
    status: row.status,
    capturedState: row.captured_state || {},
    completedSteps: row.completed_steps || [],
    restorationSteps: row.restoration_steps || [],
    readinessSnapshot: row.readiness_snapshot,
    errorSummary: row.error_summary,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readinessDeviceResult(settled, context) {
  if (settled.status === "rejected") {
    return { role: context.role, device: context.device, ready: false, issues: [settled.reason instanceof Error ? settled.reason.message : String(settled.reason)], inspection: null };
  }
  try {
    return evaluateInspection({ ...context, inspection: toolPayload(settled.value) });
  } catch (error) {
    return { role: context.role, device: context.device, ready: false, issues: [error instanceof Error ? error.message : String(error)], inspection: null };
  }
}

function publicDevice(device) {
  return { id: device.id, name: device.device_name, productionRole: device.production_role, online: liveDevices.has(device.id) };
}

async function resolveDevice(accessToken, deviceId) {
  if (deviceId) {
    const device = await getDevice(accessToken, deviceId);
    if (!device) throw new Error("That OBS computer is not linked to this account.");
    return { id: device.id, name: device.device_name };
  }

  const devices = await listDevices(accessToken);
  const online = devices.filter(device => device.online);
  if (online.length === 1) return online[0];
  const defaultOnline = online.filter(device => device.isDefault);
  if (defaultOnline.length === 1) return defaultOnline[0];
  if (online.length > 1) throw new Error("More than one OBS computer is online. Specify deviceId.");
  if (devices.length === 0) throw new Error("No OBS computers are linked to this account.");
  if (devices.length === 1) return devices[0];
  throw new Error("No linked OBS computer is currently online.");
}

async function dispatchCommand(accessToken, deviceId, command) {
  const device = await resolveDevice(accessToken, deviceId);
  const socket = liveDevices.get(device.id);
  if (!socket || socket.readyState !== 1) throw new Error(`${device.name} is offline.`);

  const requestId = randomId(12);
  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(requestId);
      reject(new Error("OBS command timed out."));
    }, 20000);
    pendingCommands.set(requestId, { resolve, reject, timeout, deviceId: device.id });
  });

  socket.send(JSON.stringify({ type: "command", requestId, command }));
  const response = await responsePromise;
  if (response?.ok === false) throw new Error(response.error || "OBS command failed.");
  return { device, response };
}

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: `${publicBaseUrl}/mcp`,
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "OBS Creator Assistant"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    authConfigured: true,
    mcpEndpoint: `${publicBaseUrl}/mcp`,
    connectedDevices: liveDevices.size
  });
});

app.post("/v1/devices/register", async (req, res) => {
  const deviceId = crypto.randomUUID();
  const deviceSecret = randomId(32);
  const pairingCode = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const deviceName = String(req.body?.deviceName || "My OBS Computer").slice(0, 120);

  const { data, error } = await supabase.rpc("register_obs_device", {
    p_device_id: deviceId,
    p_secret_hash: sha256(deviceSecret),
    p_pairing_code_hash: sha256(pairingCode),
    p_pairing_expires_at: expiresAt,
    p_device_name: deviceName
  });

  if (error) return res.status(500).json({ error: "Unable to register device", detail: error.message });
  res.status(201).json({ deviceId: data || deviceId, deviceSecret, pairingCode, expiresAt });
});

app.post("/v1/devices/:deviceId/pair", requireUser, async (req, res) => {
  const client = userClient(req.obsAccessToken);
  const { data, error } = await client.rpc("claim_obs_device", {
    p_device_id: req.params.deviceId,
    p_pairing_code_hash: sha256(String(req.body?.pairingCode || ""))
  });

  if (error) return res.status(400).json({ error: "Unable to pair device", detail: error.message });
  if (data !== true) return res.status(403).json({ error: "Pairing code is incorrect or expired" });
  const device = await getDevice(req.obsAccessToken, req.params.deviceId);
  res.json({ ok: true, device });
});

app.get("/v1/devices", requireUser, async (req, res) => {
  try {
    res.json({ devices: await listDevices(req.obsAccessToken) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/v1/devices/:deviceId/revoke", requireUser, async (req, res) => {
  const client = userClient(req.obsAccessToken);
  const { data, error } = await client
    .from("obs_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req.params.deviceId)
    .select("id, revoked_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Device not found" });

  const socket = liveDevices.get(req.params.deviceId);
  if (socket) socket.close(4003, "Device revoked");
  liveDevices.delete(req.params.deviceId);
  res.json({ ok: true, device: data });
});

app.all("/mcp", requireUser, async (req, res) => {
  await handleMcpRequest(req, res, {
    accessToken: req.obsAccessToken,
    ownerUserId: req.obsUser.id,
    listDevices,
    dispatchCommand,
    updateDevice,
    saveDualPcPreset,
    listDualPcPresets,
    inspectDualPcReadiness,
    startDualPcProduction,
    stopDualPcProduction,
    listProductionSessions,
    inspectDualPcSessionHealth,
    updateDualPcProduction
  });
});

const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`OBS Creator Assistant relay listening on ${port}`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

httpServer.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/v1/device-connect") return socket.destroy();

    const deviceId = url.searchParams.get("deviceId") || "";
    const secret = url.searchParams.get("secret") || "";
    if (!deviceId || !secret) return socket.destroy();

    const secretHash = sha256(secret);
    const { data: authenticated, error } = await supabase.rpc("authenticate_obs_device", {
      p_device_id: deviceId,
      p_secret_hash: secretHash
    });
    if (error || authenticated !== true) return socket.destroy();

    wss.handleUpgrade(req, socket, head, ws => {
      ws.deviceId = deviceId;
      ws.secretHash = secretHash;
      wss.emit("connection", ws);
    });
  } catch {
    socket.destroy();
  }
});

wss.on("connection", async ws => {
  const deviceId = ws.deviceId;
  liveDevices.set(deviceId, ws);
  await supabase.rpc("touch_obs_device", {
    p_device_id: deviceId,
    p_secret_hash: ws.secretHash
  });

  ws.on("message", async raw => {
    try {
      const msg = JSON.parse(String(raw));
      await supabase.rpc("touch_obs_device", {
        p_device_id: deviceId,
        p_secret_hash: ws.secretHash
      });

      if (msg.type === "result" && msg.requestId && pendingCommands.has(msg.requestId)) {
        const pending = pendingCommands.get(msg.requestId);
        if (pending.deviceId !== deviceId) return;
        pendingCommands.delete(msg.requestId);
        clearTimeout(pending.timeout);
        pending.resolve(msg);
      }
    } catch {}
  });

  ws.on("close", () => {
    if (liveDevices.get(deviceId) === ws) liveDevices.delete(deviceId);
    for (const [requestId, pending] of pendingCommands) {
      if (pending.deviceId === deviceId) {
        pendingCommands.delete(requestId);
        clearTimeout(pending.timeout);
        pending.reject(new Error("OBS computer disconnected."));
      }
    }
  });

  ws.send(JSON.stringify({ type: "connected", deviceId, paired: true }));
});
