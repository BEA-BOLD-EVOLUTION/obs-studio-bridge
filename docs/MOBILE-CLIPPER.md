# Mobile Clipper Architecture

## Goal

Capture TikTok LIVE from the viewer perspective so clips include the authentic mobile LIVE presentation, including chat, gifts, reactions, and TikTok's current mobile interface.

The phone does not record the clip. The phone only displays the LIVE from a separate clipper/viewer account. OBS captures the phone feed and its replay buffer provides the rolling clip history.

## Design principle

OBS Creator Assistant must not couple clipping to one phone platform or one transport.

All supported methods resolve to the same abstraction:

`Mobile Clipper Source -> OBS source -> OBS replay buffer -> Clip This`

The clipping workflow should work identically after a source is selected, regardless of how the phone feed reaches OBS.

## Supported capture methods

### AirPlay

Primary software-only path for iPhone -> Mac when the creator already has a usable AirPlay receiver/mirroring workflow.

Creator Assistant should treat the resulting mirrored display/window as a candidate Mobile Clipper source.

### Software mirroring

First-class supported method, not a later add-on.

Examples include phone-screen mirroring applications or operating-system-native mirroring that expose the phone display as a capturable window or display.

Creator Assistant should not depend on one mirroring vendor. It should allow the creator to select any existing OBS Window Capture, Display Capture, or compatible video source that represents the clipper phone.

### Hardware video capture

Phone video output -> adapter/cable -> HDMI capture device -> USB -> computer -> OBS Video Capture Device.

This is the platform-neutral fallback when AirPlay or software mirroring is unavailable, unstable, or undesirable.

## Supported combinations

| Computer | Clipper phone | Supported paths |
| --- | --- | --- |
| Mac | iPhone | AirPlay, software mirroring, hardware capture |
| Mac | Android | software mirroring, hardware capture |
| Windows | iPhone | software mirroring, hardware capture |
| Windows | Android | software mirroring, hardware capture |

The UI should recommend a likely-good method, but must not prevent another supported method from being selected.

## V1 creator workflow

1. Creator signs into a separate TikTok clipper/viewer account on a phone.
2. Clipper account opens the creator's LIVE in the TikTok mobile app.
3. Creator gets the phone display into OBS using AirPlay, software mirroring, or hardware capture.
4. Creator Assistant selects that OBS source as the Mobile Clipper source.
5. Creator Assistant verifies that the source exists and is available.
6. Creator Assistant verifies that the OBS replay buffer is active.
7. Creator presses `CLIP THIS`.
8. Creator Assistant calls OBS `SaveReplayBuffer`.
9. OBS saves the configured replay-buffer duration.
10. Creator Assistant confirms the clip was saved.

## V1 UI concept

```text
MOBILE CLIPPER

Capture method:  AirPlay / Mirroring / Capture Device
Source:          iPhone Mirror
Source status:   Ready
Replay Buffer:   Ready
Clip length:     60 seconds

[             CLIP THIS             ]
```

If clipping is not ready, the UI should identify the specific blocking condition instead of allowing an opaque failure.

Examples:

- No Mobile Clipper source selected.
- Selected source no longer exists.
- Replay Buffer is off.
- OBS is disconnected.

## Capture-method abstraction

Use a transport-neutral configuration model.

```ts
type MobileClipperCaptureMethod =
  | 'airplay'
  | 'software_mirroring'
  | 'hardware_capture'
  | 'other';

interface MobileClipperConfig {
  captureMethod: MobileClipperCaptureMethod;
  obsSourceName: string;
  replayDurationSeconds: number;
}
```

Do not encode phone OS into the clipping engine. Device/platform information may be collected for setup guidance and diagnostics, but it must not determine how `Clip This` works.

## Safety and account boundaries

- Creator Assistant does not log into TikTok.
- Creator Assistant does not store TikTok passwords or session credentials.
- Creator Assistant does not start or end a TikTok LIVE.
- The clipper account remains controlled by the creator on the phone.
- Creator Assistant only captures an OBS source that the creator explicitly selects.

## Future LiveIQ integration

Manual and automatic clipping should converge on the same save/export pipeline.

- Manual: creator presses `CLIP THIS`.
- Automatic: LiveIQ identifies a high-interest timestamp and requests or marks a candidate clip.

LiveIQ should remain the intelligence layer; OBS Creator Assistant remains the local capture/control layer.

## Non-goals for V1

- Rebuilding TikTok's mobile interface.
- Automating TikTok account login.
- Controlling the TikTok mobile app.
- Uploading clips automatically.
- AI trimming or caption generation.

Those can be layered onto the saved clip workflow later without changing the capture-method abstraction.
