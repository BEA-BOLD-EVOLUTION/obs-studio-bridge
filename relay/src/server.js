import crypto from "node:crypto";
import express from "express";
import { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const app = express();
app.use(express.json({ limit: "1mb" }));

const pendingRegistrations = new Map();
const liveDevices = new Map();
const pendingCommands = new Map();

function id(bytes = 18) { return crypto.randomBytes(bytes).toString("base64url"); }
function uuid() { return crypto.randomUUID(); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function userClient(accessToken) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

async function requireUser(req, res, next) {
  const authorization = req.header("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return res.status(401).json({ error: "Authentication required" });

  const accessToken = match[1];
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired access token" });

  req.obsUser = data.user;
  req.obsAccessToken = accessToken;
  next();
}

async function getOwnedDevice(req, deviceId) {
  const client = userClient(req.obsAccessToken);
  const { data, error } = await client
    .from("obs_devices")
    .select("id, owner_user_id, device_name, paired_at, last_seen_at, revoked_at")
    .eq("id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

app.get("/health", (_req, res) => res.json({
  ok: true,
  authConfigured: true,
  connectedDevices: liveDevices.size,
  pendingPairings: pendingRegistrations.size
}));

// Called by the Windows companion before the creator signs into ChatGPT.
// The registration is intentionally short-lived and gains no OBS control rights
// until an authenticated user claims it with the matching pairing code.
app.post("/v1/devices/register", (req, res) => {
  const deviceId = uuid();
  const deviceSecret = id(32);
  const pairingCode = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const deviceName = String(req.body?.deviceName || "My OBS Computer").slice(0, 120);

  pendingRegistrations.set(deviceId, {
    deviceId,
    secretHash: hash(deviceSecret),
    pairingCodeHash: hash(pairingCode),
    deviceName,
    expiresAt
  });

  res.status(201).json({ deviceId, deviceSecret, pairingCode, expiresAt });
});

// Authenticated creator claims a pending local companion. The insert is executed
// with that creator's JWT, so Supabase RLS itself enforces owner_user_id = auth.uid().
app.post("/v1/devices/:deviceId/pair", requireUser, async (req, res) => {
  const pending = pendingRegistrations.get(req.params.deviceId);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingRegistrations.delete(req.params.deviceId);
    return res.status(404).json({ error: "Pairing request expired or was not found" });
  }
  if (hash(String(req.body?.pairingCode || "")) !== pending.pairingCodeHash) {
    return res.status(403).json({ error: "Incorrect pairing code" });
  }

  const client = userClient(req.obsAccessToken);
  const { data, error } = await client
    .from("obs_devices")
    .insert({
      id: pending.deviceId,
      owner_user_id: req.obsUser.id,
      device_name: pending.deviceName,
      secret_hash: pending.secretHash,
      paired_at: new Date().toISOString()
    })
    .select("id, device_name, paired_at")
    .single();

  if (error) return res.status(400).json({ error: "Unable to pair device", detail: error.message });

  pendingRegistrations.delete(req.params.deviceId);
  res.json({ ok: true, device: data });
});

app.get("/v1/devices", requireUser, async (req, res) => {
  const client = userClient(req.obsAccessToken);
  const { data, error } = await client
    .from("obs_devices")
    .select("id, device_name, paired_at, last_seen_at, revoked_at")
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ devices: (data || []).map(device => ({
    ...device,
    online: liveDevices.has(device.id) && !device.revoked_at
  })) });
});

app.get("/v1/devices/:deviceId/status", requireUser, async (req, res) => {
  try {
    const device = await getOwnedDevice(req, req.params.deviceId);
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json({ ...device, online: liveDevices.has(device.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

app.post("/v1/devices/:deviceId/commands", requireUser, async (req, res) => {
  let device;
  try {
    device = await getOwnedDevice(req, req.params.deviceId);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!device) return res.status(404).json({ error: "Device not found" });

  const socket = liveDevices.get(device.id);
  if (!socket || socket.readyState !== 1) return res.status(409).json({ error: "Device is offline" });

  const requestId = id(12);
  const timeout = setTimeout(() => {
    const item = pendingCommands.get(requestId);
    if (item) {
      pendingCommands.delete(requestId);
      item.resolve({ status: 504, body: { error: "Device command timed out" } });
    }
  }, 15000);

  const result = new Promise(resolve => pendingCommands.set(requestId, { resolve, deviceId: device.id }));
  socket.send(JSON.stringify({ type: "command", requestId, command: req.body }));
  const response = await result;
  clearTimeout(timeout);
  res.status(response.status || 200).json(response.body);
});

const server = app.listen(port, "0.0.0.0", () => console.log(`OBS Creator Assistant relay listening on ${port}`));
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/v1/device-connect") return socket.destroy();

    const deviceId = url.searchParams.get("deviceId") || "";
    const secret = url.searchParams.get("secret") || "";
    if (!deviceId || !secret) return socket.destroy();

    const secretHash = hash(secret);
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
  await supabase.rpc("touch_obs_device", { p_device_id: deviceId, p_secret_hash: ws.secretHash });

  ws.on("message", async raw => {
    try {
      const msg = JSON.parse(String(raw));
      await supabase.rpc("touch_obs_device", { p_device_id: deviceId, p_secret_hash: ws.secretHash });
      if (msg.type === "result" && msg.requestId && pendingCommands.has(msg.requestId)) {
        const item = pendingCommands.get(msg.requestId);
        if (item.deviceId !== deviceId) return;
        pendingCommands.delete(msg.requestId);
        item.resolve({ status: msg.ok === false ? 500 : 200, body: msg });
      }
    } catch {}
  });

  ws.on("close", () => {
    if (liveDevices.get(deviceId) === ws) liveDevices.delete(deviceId);
    for (const [requestId, item] of pendingCommands) {
      if (item.deviceId === deviceId) {
        pendingCommands.delete(requestId);
        item.resolve({ status: 503, body: { error: "Device disconnected" } });
      }
    }
  });

  ws.send(JSON.stringify({ type: "connected", deviceId, paired: true }));
});

setInterval(() => {
  const now = Date.now();
  for (const [deviceId, pending] of pendingRegistrations) {
    if (pending.expiresAt < now) pendingRegistrations.delete(deviceId);
  }
}, 60_000).unref();
