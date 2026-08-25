# Clipping Architecture

## Goal

Give creators one `CLIP THIS` workflow with a choice of what perspective to save.

V1 supports two clip sources:

- **Program View** — saves the creator's normal OBS program output.
- **Viewer View** — saves the authentic TikTok mobile viewer perspective, including chat, gifts, reactions, and TikTok's current mobile UI.

Viewer View is optional. Creators who do not want or need a separate viewer phone can use Program View only.

## Why the two modes use different OBS roles

OBS's built-in Replay Buffer records the current OBS program output. It does not independently buffer an arbitrary source while another scene is being used for production.

Therefore:

`Program View -> Production OBS -> replay buffer -> Clip This`

`Viewer View -> viewer phone -> AirPlay / mirroring / capture device -> dedicated Viewer/Clipper OBS -> replay buffer -> Clip This`

The dedicated Viewer/Clipper OBS prevents the mobile viewer feed from replacing or contaminating the production program.

## Creator choice

The OBS Creator Assistant dock exposes a **Clip source** selector:

```text
CLIPPING

Clip source: [ Program View ▼ ]

● Clipping ready
Program View scene: Main Camera

[ Enable Clipping ] [ CLIP THIS ]
```

or:

```text
CLIPPING

Clip source: [ Viewer View ▼ ]

● Clipping ready
Viewer View scene: Phone Viewer

[ Enable Clipping ] [ CLIP THIS ]
```

The creator can switch between modes. Each mode has its own replay-buffer readiness state.

## Program View

Program View uses the creator's existing Production OBS connection.

Use this when the creator wants a clean clip of the content they are producing without TikTok's viewer-side interface.

No second phone or second OBS session is required.

## Viewer View

Viewer View captures TikTok LIVE from a separate viewer/clipper account on a phone.

The phone does not record the clip. It only displays the LIVE. A dedicated Viewer/Clipper OBS session captures the phone feed and maintains its own replay buffer.

### Supported phone capture methods

#### AirPlay

Primary software-only path for iPhone -> Mac when a usable AirPlay receiver/mirroring workflow is available.

#### Software mirroring

First-class supported method. Any mirroring application or operating-system feature that produces a capturable phone display can be used.

#### Hardware video capture

Phone video output -> adapter/cable -> HDMI capture device -> USB -> computer -> Viewer/Clipper OBS Video Capture Device.

This is the platform-neutral fallback when AirPlay or software mirroring is unavailable, unstable, or undesirable.

### Supported combinations

| Computer | Viewer phone | Supported paths |
| --- | --- | --- |
| Mac | iPhone | AirPlay, software mirroring, hardware capture |
| Mac | Android | software mirroring, hardware capture |
| Windows | iPhone | software mirroring, hardware capture |
| Windows | Android | software mirroring, hardware capture |

The setup UI should recommend a likely-good method but must not prevent another supported method from being selected.

## V1 workflow

### Program View

1. Creator runs the normal OBS production.
2. Creator selects `Program View` in OBS Creator Assistant.
3. Creator Assistant verifies the Production OBS connection and replay-buffer state.
4. Creator presses `Enable Clipping` if needed.
5. Creator presses `CLIP THIS` whenever a moment should be saved.
6. Creator Assistant saves the Production OBS replay buffer.

### Viewer View

1. Creator signs into a separate TikTok viewer/clipper account on a phone.
2. Viewer account opens the creator's LIVE in the TikTok mobile app.
3. Creator gets the phone display into a dedicated Viewer/Clipper OBS session using AirPlay, software mirroring, or hardware capture.
4. The phone-view scene is made the Viewer/Clipper OBS program scene.
5. Viewer/Clipper OBS WebSocket runs on a separate endpoint from Production OBS. Default V1 port: `4456`.
6. Creator selects `Viewer View` in OBS Creator Assistant.
7. Creator Assistant verifies that Viewer/Clipper OBS is connected and shows its active program scene.
8. Creator presses `Enable Clipping` if needed.
9. Creator presses `CLIP THIS` whenever a moment should be saved.
10. Creator Assistant saves the Viewer/Clipper OBS replay buffer.

## Local control boundary

The local companion exposes clipping controls only on `127.0.0.1` using a separate control port (default `8789`). Native dock requests include a custom `X-OBS-Creator-Assistant` header so ordinary cross-origin browser requests cannot invoke clip actions as simple requests.

Supported local actions:

- Read replay-buffer status for the selected clip source.
- Start the selected source's replay buffer.
- Save the selected source's replay buffer.

TikTok credentials are never passed to OBS Creator Assistant.

## Configuration

```env
# Program View / Production OBS
OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
OBS_WEBSOCKET_PASSWORD=

# Viewer View / dedicated Viewer-Clipper OBS
CLIPPER_OBS_WEBSOCKET_URL=ws://127.0.0.1:4456
CLIPPER_OBS_WEBSOCKET_PASSWORD=
CLIPPER_CONTROL_PORT=8789
```

## Capture-method abstraction

Phone OS and transport are Viewer View setup metadata, not clipping-engine dependencies.

```ts
type ClipMode = 'program' | 'viewer';

type ViewerCaptureMethod =
  | 'airplay'
  | 'software_mirroring'
  | 'hardware_capture'
  | 'other';
```

`CLIP THIS` targets the replay buffer associated with the currently selected Clip Mode.

## Safety and account boundaries

- Creator Assistant does not log into TikTok.
- Creator Assistant does not store TikTok passwords or session credentials.
- Creator Assistant does not start or end a TikTok LIVE.
- A Viewer View clipper account remains controlled by the creator on the phone.
- Production OBS and Viewer/Clipper OBS remain separate outputs.

## Future LiveIQ integration

Manual and automatic clipping should converge on the same save/export pipeline.

- Manual: creator presses `CLIP THIS`.
- Automatic: LiveIQ identifies a high-interest timestamp and requests or marks a candidate clip.

LiveIQ can eventually respect the creator's preferred clip source or generate both perspectives when both buffers are available.

LiveIQ remains the intelligence layer; OBS Creator Assistant remains the local capture/control layer.

## Non-goals for V1

- Rebuilding TikTok's mobile interface.
- Automating TikTok account login.
- Controlling the TikTok mobile app.
- Uploading clips automatically.
- AI trimming or caption generation.

Those can be layered onto the saved clip workflow later without changing the clip-source abstraction.
