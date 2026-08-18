import crypto from "node:crypto";
import express from "express";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 3000);
const adminKey = process.env.RELAY_ADMIN_KEY || "";
const app = express();
app.use(express.json({ limit: "1mb" }));

const devices = new Map();
const pending = new Map();

function id(bytes = 18) { return crypto.randomBytes(bytes).toString("base64url"); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function requireAdmin(req, res, next) {
  if (!adminKey || req.header("authorization") !== `Bearer ${adminKey}`) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true, connectedDevices: [...devices.values()].filter(d => d.socket?.readyState === 1).length }));

app.post("/v1/devices/register", (req, res) => {
  const deviceId = id(12);
  const deviceSecret = id(32);
  const pairingCode = String(crypto.randomInt(100000, 999999));
  devices.set(deviceId, { deviceId, secretHash: hash(deviceSecret), pairingCodeHash: hash(pairingCode), paired: false, createdAt: Date.now(), socket: null });
  res.status(201).json({ deviceId, deviceSecret, pairingCode });
});

app.post("/v1/devices/:deviceId/pair", requireAdmin, (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device || hash(String(req.body?.pairingCode || "")) !== device.pairingCodeHash) return res.status(404).json({ error: "Device or pairing code not found" });
  device.paired = true;
  device.pairingCodeHash = null;
  res.json({ ok: true, deviceId: device.deviceId });
});

app.get("/v1/devices/:deviceId/status", requireAdmin, (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  res.json({ deviceId: device.deviceId, paired: device.paired, online: device.socket?.readyState === 1, lastSeen: device.lastSeen || null });
});

app.post("/v1/devices/:deviceId/commands", requireAdmin, async (req, res) => {
  const device = devices.get(req.params.deviceId);
  if (!device?.paired || device.socket?.readyState !== 1) return res.status(409).json({ error: "Device is not paired and online" });
  const requestId = id(12);
  const timeout = setTimeout(() => {
    const item = pending.get(requestId);
    if (item) { pending.delete(requestId); item.resolve({ status: 504, body: { error: "Device command timed out" } }); }
  }, 15000);
  const result = new Promise(resolve => pending.set(requestId, { resolve }));
  device.socket.send(JSON.stringify({ type: "command", requestId, command: req.body }));
  const response = await result;
  clearTimeout(timeout);
  res.status(response.status || 200).json(response.body);
});

const server = app.listen(port, "0.0.0.0", () => console.log(`OBS Creator Assistant relay listening on ${port}`));
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/v1/device-connect") return socket.destroy();
  const deviceId = url.searchParams.get("deviceId") || "";
  const secret = url.searchParams.get("secret") || "";
  const device = devices.get(deviceId);
  if (!device || hash(secret) !== device.secretHash) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, device));
});

wss.on("connection", (ws, device) => {
  device.socket = ws;
  device.lastSeen = Date.now();
  ws.on("message", raw => {
    try {
      const msg = JSON.parse(String(raw));
      device.lastSeen = Date.now();
      if (msg.type === "result" && msg.requestId && pending.has(msg.requestId)) {
        const item = pending.get(msg.requestId);
        pending.delete(msg.requestId);
        item.resolve({ status: msg.ok === false ? 500 : 200, body: msg });
      }
    } catch {}
  });
  ws.on("close", () => { if (device.socket === ws) device.socket = null; });
  ws.send(JSON.stringify({ type: "connected", deviceId: device.deviceId, paired: device.paired }));
});
