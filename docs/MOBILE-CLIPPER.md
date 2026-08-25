# Mobile Clipper Architecture

## Goal

Capture TikTok LIVE from the viewer perspective so clips include the authentic mobile LIVE presentation, including chat, gifts, reactions, and TikTok's current mobile interface.

The phone does not record the clip. The phone only displays the LIVE from a separate clipper/viewer account. A dedicated Clipper OBS session captures that phone feed and maintains the rolling replay buffer.

## Why Clipper OBS is separate

OBS's built-in Replay Buffer records the current OBS program output. It does not independently buffer an arbitrary source while another scene is being used for production.

Therefore V1 uses two OBS roles:

`Production OBS -> creator program -> TikTok LIVE Studio`

`Clipper phone -> AirPlay / mirroring / capture device -> Clipper OBS -> replay buffer -> Clip This`

The two roles may run on the same computer or on separate computers. Keeping them separate prevents the mobile viewer feed from replacing or contaminating the creator's production program.

## Design principle

OBS Creator Assistant must not couple clipping to one phone platform or one transport.

All supported capture methods resolve to the same abstraction:

`Phone viewer feed -> dedicated Clipper OBS program -> replay buffer -> Clip This`

The clipping workflow works identically after the phone feed reaches Clipper OBS.

## Supported capture methods

### AirPlay

Primary software-only path for iPhone -> Mac when a usable AirPlay receiver/mirroring workflow is available.

### Software mirroring

First-class supported method, not a later add-on. Any mirroring application or operating-system feature that produces a capturable phone display can be used.

### Hardware video capture

Phone video output -> adapter/cable -> HDMI capture device -> USB -> computer -> Clipper OBS Video Capture Device.

This is the platform-neutral fallback when AirPlay or software mirroring is unavailable, unstable, or undesirable.

## Supported combinations

| Computer | Clipper phone | Supported paths |
| --- | --- | --- |
| Mac | iPhone | AirPlay, software mirroring, hardware capture |
| Mac | Android | software mirroring, hardware capture |
| Windows | iPhone | software mirroring, hardware capture |
| Windows | Android | software mirroring, hardware capture |

The setup UI should recommend a likely-good method but must not prevent another supported method from being selected.

## V1 creator workflow

1. Creator signs into a separate TikTok clipper/viewer account on a phone.
2. Clipper account opens the creator's LIVE in the TikTok mobile app.
3. Creator gets the phone display into a dedicated Clipper OBS session using AirPlay, software mirroring, or hardware capture.
4. The phone-view scene is made the Clipper OBS program scene.
5. Clipper OBS WebSocket runs on a separate endpoint from Production OBS. Default V1 port: `4456`.
6. Creator Assistant verifies that Clipper OBS is connected.
7. Creator Assistant shows the active Clipper OBS program scene.
8. Creator presses `Enable Clipping` once to start the dedicated replay buffer.
9. Creator presses `CLIP THIS` whenever a moment should be saved.
10. Creator Assistant calls Clipper OBS `SaveReplayBuffer` and confirms the clip was saved.

## V1 dock UI

```text
MOBILE CLIPPER

● Clipper ready
Clipper OBS scene: Phone Viewer

[ Enable Clipping ] [      CLIP THIS      ]
```

If Clipper OBS is unavailable, the dock identifies the blocking condition instead of silently saving the production output.

## Local control boundary

The local companion exposes Clipper OBS controls only on `127.0.0.1` using a separate control port (default `8789`). Native dock requests include a custom `X-OBS-Creator-Assistant` header so ordinary cross-origin browser requests cannot invoke clip actions as simple requests.

Supported local actions:

- Read Clipper OBS connection, scene, and replay-buffer status.
- Start the Clipper OBS replay buffer.
- Save the current Clipper OBS replay buffer.

TikTok credentials are never passed to OBS Creator Assistant.

## Configuration

```env
# Production OBS
OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
OBS_WEBSOCKET_PASSWORD=

# Dedicated viewer-perspective clipper
CLIPPER_OBS_WEBSOCKET_URL=ws://127.0.0.1:4456
CLIPPER_OBS_WEBSOCKET_PASSWORD=
CLIPPER_CONTROL_PORT=8789
```

## Capture-method abstraction

Phone OS and transport are setup metadata, not clipping-engine dependencies.

```ts
type MobileClipperCaptureMethod =
  | 'airplay'
  | 'software_mirroring'
  | 'hardware_capture'
  | 'other';
```

`CLIP THIS` always targets the dedicated Clipper OBS replay buffer regardless of capture method.

## Safety and account boundaries

- Creator Assistant does not log into TikTok.
- Creator Assistant does not store TikTok passwords or session credentials.
- Creator Assistant does not start or end a TikTok LIVE.
- The clipper account remains controlled by the creator on the phone.
- Production OBS and Clipper OBS remain separate outputs.

## Future LiveIQ integration

Manual and automatic clipping should converge on the same save/export pipeline.

- Manual: creator presses `CLIP THIS`.
- Automatic: LiveIQ identifies a high-interest timestamp and requests or marks a candidate clip.

LiveIQ remains the intelligence layer; OBS Creator Assistant remains the local capture/control layer.

## Non-goals for V1

- Rebuilding TikTok's mobile interface.
- Automating TikTok account login.
- Controlling the TikTok mobile app.
- Uploading clips automatically.
- AI trimming or caption generation.

Those can be layered onto the saved clip workflow later without changing the capture-method abstraction.
