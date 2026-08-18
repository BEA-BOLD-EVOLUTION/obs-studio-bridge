import crypto from "node:crypto";
import express from "express";
import { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";
import { handleMcpRequest } from "./mcp.js";

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
    .select("id, device_name, paired_at, last_seen_at, revoked_at, created_at")
    .is("revoked_at", null)
    .not("owner_user_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(device => ({
    id: device.id,
    name: device.device_name,
    pairedAt: device.paired_at,
    lastSeenAt: device.last_seen_at,
    online: liveDevices.has(device.id)
  }));
}

async function getDevice(accessToken, deviceId) {
  const client = userClient(accessToken);
  const { data, error } = await client
    .from("obs_devices")
    .select("id, device_name, paired_at, last_seen_at, revoked_at")
    .eq("id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
    listDevices,
    dispatchCommand
  });
});

const httpServer = app.listen(port, "0.0.0.0", () => {
  console.log(`OBS Creator Assistant relay listening on ${port}`);
});

const wss = new WebSocketServer({ noServer: true });

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
