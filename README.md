# OBS Studio MCP Bridge

This package connects OBS Studio 28+ to ChatGPT or Codex through a small Model Context Protocol (MCP) server. The bridge listens only on `127.0.0.1`, requires a separate bearer token for every MCP request, and exposes named OBS actions rather than a generic request passthrough.

## What it can do

- Inspect OBS status, scenes, scene sources, audio inputs, video settings, and performance statistics.
- Diagnose render lag, encoding lag, and stream congestion.
- Switch the program scene.
- Show or hide a source in a scene.
- Mute, unmute, or set the volume of an audio input.
- Start or stop streaming and recording.
- Save the replay buffer.

The bridge cannot execute arbitrary OBS WebSocket requests.

## Requirements

- Windows PowerShell 5.1 or newer.
- Node.js 20 or newer, including npm.
- OBS Studio 28 or newer.
- OBS WebSocket enabled under **OBS → Tools → WebSocket Server Settings**. Keep password authentication enabled; the default port is `4455`.

## Install

1. Extract this ZIP.
2. Open PowerShell in the extracted `obs-studio-bridge` folder.
3. Run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\setup.ps1
   ```

4. Open the generated environment file:

   ```powershell
   notepad .env
   ```

5. Paste the password from **OBS → Tools → WebSocket Server Settings** into `OBS_WEBSOCKET_PASSWORD`.
6. Generate a separate bridge token:

   ```powershell
   $bytes = New-Object byte[] 48
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

7. Paste the result into `BRIDGE_AUTH_TOKEN`. Do not reuse your OBS password.
8. Start the bridge:

   ```powershell
   .\start-bridge.ps1
   ```

9. In a second PowerShell window, test the OBS connection:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8787/health
   ```

A successful response contains `ok: true` and `obsConnected: true`. A `503` response includes the OBS connection error; confirm OBS is open, the WebSocket server is enabled, and the password is correct.

## Connect locally from Codex

The included `.mcp.json` points to:

```text
http://127.0.0.1:8787/mcp
```

It supplies `Authorization: Bearer ${BRIDGE_AUTH_TOKEN}`. Set `BRIDGE_AUTH_TOKEN` in the environment that launches Codex to the same value stored in `.env`, then install or load the plugin. The bridge process must be running whenever the tools are used.

## Connect from ChatGPT

ChatGPT cannot call a localhost URL directly. Use a secure tunnel; never forward port `8787` directly through your router.

### Preferred: OpenAI Secure MCP Tunnel

OpenAI Secure MCP Tunnel keeps the server private and uses an outbound HTTPS connection:

1. Create a tunnel in [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels).
2. Download the current `tunnel-client` from that page.
3. Configure its HTTP MCP target as `http://127.0.0.1:8787/mcp` and configure the MCP-side request header as:

   ```text
   Authorization: Bearer YOUR_BRIDGE_AUTH_TOKEN
   ```

4. Run `tunnel-client doctor` for the profile, then keep `tunnel-client run` active.
5. In ChatGPT developer mode, create an app, choose **Tunnel** under Connection, select the tunnel, and scan its tools.

Follow the current [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) because tunnel-client flags and workspace permissions may change.

### Public HTTPS tunnel

If your ChatGPT plan or workspace does not offer Secure MCP Tunnel, use a reputable HTTPS tunnel that forwards only to `http://127.0.0.1:8787`. Configure the ChatGPT MCP connection with:

- Endpoint: `https://YOUR-TUNNEL-HOST/mcp`
- Header name: `Authorization`
- Header value: `Bearer YOUR_BRIDGE_AUTH_TOKEN`

Keep the bearer header enabled at all times, use an unguessable token, and rotate it by changing `.env` and restarting the bridge if it is exposed. Temporary tunnel URLs change when restarted; update the ChatGPT app when that happens.

In ChatGPT, developer-mode custom MCP apps are created under **Settings → Apps → Create** (availability and write-action support depend on the plan and workspace policy). Scan tools, review every write action, and leave confirmation enabled for actions such as starting a stream or recording.

## MCP endpoint and authentication

- MCP endpoint: `http://127.0.0.1:8787/mcp`
- Health endpoint: `http://127.0.0.1:8787/health`
- Authentication: `Authorization: Bearer YOUR_BRIDGE_AUTH_TOKEN`
- Transport: Streamable HTTP with JSON responses

The health route is intentionally unauthenticated and returns only bridge/OBS connectivity. Every request under `/mcp` requires the bearer token.

## Exposed tools

| Tool | Action |
| --- | --- |
| `obs_inspect_status` | Read version, stream, recording, and replay status |
| `obs_list_scenes` | List scenes and current program/preview scenes |
| `obs_list_sources` | List source items in one scene |
| `obs_list_audio_inputs` | List audio-capable inputs with mute and volume state |
| `obs_get_video_settings` | Read resolution, FPS, and format settings |
| `obs_get_performance_stats` | Read OBS performance counters |
| `obs_diagnose_performance` | Interpret render, encode, and congestion metrics |
| `obs_switch_scene` | Change the program scene |
| `obs_set_source_visibility` | Show or hide a scene source |
| `obs_set_input_mute` | Mute or unmute an input |
| `obs_set_input_volume` | Set input volume in dB (`-100` to `+26`) |
| `obs_start_streaming` / `obs_stop_streaming` | Control streaming |
| `obs_start_recording` / `obs_stop_recording` | Control recording |
| `obs_save_replay_buffer` | Save the current replay buffer |

## Security boundaries

- The HTTP listener is hard-coded to loopback (`127.0.0.1`).
- The OBS WebSocket password is read only from local `.env` and is never returned by a tool.
- The MCP bearer token is separate from the OBS password and compared in constant time.
- MCP request bodies are capped at 1 MB.
- There is no generic OBS call tool, shell command, filesystem tool, or arbitrary network proxy.
- `.env`, dependencies, and compiled output are excluded by `.gitignore`.

Anyone who obtains the bridge token and can reach the tunneled endpoint can control the allowlisted OBS actions. Protect it like a password.

## Troubleshooting

- **`BRIDGE_AUTH_TOKEN must contain at least 32 characters`**: generate a new token using the PowerShell command above.
- **Health returns `503`**: open OBS, enable WebSocket, verify port `4455`, and recheck `OBS_WEBSOCKET_PASSWORD`.
- **`401 Unauthorized` from `/mcp`**: the caller's bearer token does not match `.env`.
- **Replay save fails**: enable and start OBS Replay Buffer first.
- **Source visibility fails**: use the exact scene and source names returned by the list tools.
- **ChatGPT cannot scan tools**: confirm the bridge and tunnel client are both running, verify the tunneled endpoint ends in `/mcp`, and check the bearer header.
- **Dependencies fail to download**: verify npm can reach the public npm registry, then rerun `npx --yes pnpm@10 install --frozen-lockfile` and `npm run build`.

## Development

```powershell
npx --yes pnpm@10 install --frozen-lockfile
npm run check
npm run build
npm start
```

The bridge uses the public packages `@modelcontextprotocol/sdk`, `obs-websocket-js`, `express`, `zod`, and `dotenv`.
