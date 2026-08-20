# OBS Creator Assistant

OBS Creator Assistant connects OBS Studio to ChatGPT through a secure local companion and a native OBS dock.

## Release status

The Windows installer is temporarily unavailable. The unsigned v1.3.0 installer was withdrawn after antivirus warnings.

The project has applied to the SignPath Foundation open-source program. Approval is pending. Until approval and signing verification are complete, unsigned installers will not be published.

If the application is accepted, future Windows releases will:

- Be built from this public repository by GitHub Actions.
- Require manual signing approval.
- Be signed by SignPath Foundation.
- Include a SHA-256 checksum and a link to the source commit.

Do not download installers from mirrors or third-party sites. There is currently no approved Windows installer.

## Install on Windows

These instructions will apply after an approved, signed release is published:

1. Download **OBS-Creator-Assistant-Setup.exe** only from the [official releases page](https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge/releases).
2. Close OBS Studio.
3. Double-click the installer and approve the Windows prompt.
4. Reopen OBS Studio and choose **Docks → OBS Creator Assistant**.

That one installer adds both the OBS plugin and the desktop helper, detects the local OBS WebSocket settings, starts the helper automatically with Windows, and opens the connection screen. Existing connection settings are preserved when upgrading.

No ZIP extraction, terminal, Node.js installation, token generation, or manual file editing is required.

## Capabilities

OBS Creator Assistant intentionally exposes a limited set of OBS actions. The hosted ChatGPT connection has a smaller remote allowlist than the local bridge.

### Available from ChatGPT

#### Connect and manage your OBS computers

- Pair an OBS computer to your signed-in account with the six-digit code displayed by the desktop helper.
- List the OBS computers paired to your account.
- See whether each paired computer is currently online.
- Select a specific paired computer when more than one is available.
- Access only computers owned by the authenticated account.

Example requests:

- “Pair code 483921.”
- “Is my OBS computer online?”
- “List my connected OBS computers.”

#### Inspect OBS

- Read the OBS and OBS WebSocket versions.
- Check whether streaming is active.
- Check whether recording is active.
- Check whether the replay buffer is active.
- List all scenes.
- Identify the current program scene and preview scene.

Example requests:

- “Is OBS connected and am I streaming?”
- “What scene is live right now?”
- “List my OBS scenes.”

#### Control the live scene

- Switch the current program output to an existing named scene.
- Safely report an error when the requested scene does not exist.

Example request:

- “Switch OBS to the Battle scene.”

#### Run a three-part media transition

- Switch to an existing media scene.
- Play a transition-in media source.
- Play a featured media source.
- Play a transition-out media source.
- Wait for each clip to finish before continuing.
- Hide the sequence sources when finished.
- Return to the scene that was live before the sequence began.
- Attempt to restore the previous scene and audio state if the sequence fails.

The sequence engine works with AI-generated videos or any compatible OBS media inputs.

Example request:

- “Run my AI transition using Transition In, Dragon Video, and Transition Out on my Media scene.”

#### Share a screen or window already configured in OBS

- Show an existing display-capture or window-capture source.
- Fit the capture source to the OBS canvas.
- Present it fullscreen.
- Present it with an existing camera source as picture-in-picture.
- Position and scale the camera overlay.
- Report which scene to return to when sharing is finished.
- Restore the previous scene if setup fails.

This feature uses sources that already exist in OBS; it does not create a new capture source or choose a new window for you.

Example request:

- “Share my Chrome capture on the Screen Share scene and keep my camera picture-in-picture.”

#### Run custom creator workflows

A custom workflow may contain up to 100 ordered actions:

- Switch to an existing scene.
- Show or hide an existing source.
- Restart an existing media input.
- Restart a media input and wait for it to finish.
- Wait for a specified duration.
- Mute or unmute an audio input.
- Set an audio input volume between -100 dB and +26 dB.

A workflow can optionally restore the previous live scene and affected mute states when it completes. Restoration after a failed workflow is enabled by default.

Example request:

- “Switch to Starting Soon, play my countdown, wait for it to finish, then switch to Live.”

### Available through the local bridge

The localhost-only MCP bridge includes additional tools for local integrations and development. These tools are not currently exposed through the hosted ChatGPT remote-command allowlist.

#### Detailed inspection

- List sources in a scene, including visibility and transform metadata.
- List inputs that support audio, including mute and volume values.
- Read base resolution, output resolution, frame rate, and video format.
- Read CPU usage, memory usage, active FPS, render time, render lag, and encoding lag.
- Diagnose render lag, encoding lag, dropped frames, and network congestion.
- List the built-in creator workflows.

#### Direct controls

- Show or hide an existing source in a named scene.
- Mute or unmute an existing audio input.
- Set an existing audio input volume between -100 dB and +26 dB.
- Start or stop streaming.
- Start or stop recording.
- Save the current replay buffer.
- Run the same media-transition, screen-sharing, and custom-workflow engines described above.

Output controls check the current state first, so repeated start or stop requests do not unnecessarily toggle an output.

### What it does not do

OBS Creator Assistant does not currently:

- Execute arbitrary OBS WebSocket requests.
- Create, delete, or rename scenes, sources, profiles, or scene collections.
- Create a screen/window capture source or change which window an existing source captures.
- Install OBS plugins or modify arbitrary files on the computer.
- Close applications, restart the computer, or provide general operating-system control.
- Control an OBS computer that is not paired to the authenticated user's account.
- Send the OBS WebSocket password to ChatGPT or the hosted relay.
- Expose local-only output controls through the current hosted ChatGPT allowlist.

## Phase 2 — Planned features

Phase 2 is the proposed roadmap, not functionality available in the current release. Scope and order may change based on user feedback, security review, OBS compatibility, and code-signing approval.

### Safer remote production controls

- Start and stop streaming from ChatGPT with an explicit confirmation step.
- Start and stop recording from ChatGPT.
- Start the replay buffer and save replays from ChatGPT.
- Add preflight checks before going live, including OBS connection, output state, encoder health, and scene readiness.
- Add guardrails that prevent accidental duplicate starts, stops, or scene changes.

### Scene and source management

- Create, duplicate, rename, reorder, and remove scenes.
- Create and configure supported source types.
- Change the display or window targeted by a capture source.
- Move, resize, crop, align, and layer scene items.
- Copy sources and layouts between scenes.
- Save and restore scene-layout snapshots.

### Advanced audio control

- Display live audio levels and clipping warnings.
- Control audio monitoring, sync offsets, and track assignments.
- Add and configure supported audio filters.
- Save reusable audio presets.
- Run microphone and desktop-audio readiness checks.

### Reusable automation

- Save custom workflows instead of submitting every step each time.
- Create workflow templates for starting a show, taking a break, sharing a screen, playing media, and ending a broadcast.
- Add conditional steps, retries, timeouts, and recovery actions.
- Preview and validate a workflow before it changes OBS.
- Add a visual workflow builder for non-technical creators.

### Monitoring and troubleshooting

- Continuously monitor dropped frames, render lag, encoding lag, CPU load, memory use, and network congestion.
- Notify the creator when performance crosses configurable thresholds.
- Compare current settings with available hardware and intended streaming targets.
- Generate a pre-show readiness report.
- Keep a local diagnostic history that can be exported for support.

### Profiles, scene collections, and backups

- Inspect and switch OBS profiles and scene collections.
- Back up supported OBS configuration before major changes.
- Restore a known-good configuration after a failed setup or workflow.
- Clearly preview and confirm high-impact configuration changes.

### Dual-PC TikTok LIVE Studio production

Support creators who use one OBS computer for backgrounds and a second OBS computer for camera composition, overlays, and effects, with the finished video delivered to TikTok LIVE Studio through OBS Virtual Camera:

- Name both computers and assign **Background** and **Camera/Compositor** roles.
- Save the scenes, receiving source, overlays, effects, and final output as a reusable production preset.
- Verify that both computers, both OBS instances, required scenes, and the receiving source are ready.
- Coordinate scene changes on both computers in the correct order.
- Inspect, start, and stop OBS Virtual Camera on the Camera/Compositor PC.
- Use OBS Virtual Camera as a Camera source inside TikTok LIVE Studio.
- Validate the OBS resolution, frame rate, and portrait or landscape framing before the creator goes live.
- Keep TikTok's preview, audio test, LIVE settings, and final **Go LIVE** / **End LIVE** actions under creator control.
- Monitor performance and output status on both OBS computers.
- Restore each computer's previous scene and affected state after a failure or when production ends.
- Keep the inter-PC video connection transport-independent so creators can use an existing capture card, NDI, OBS Teleport, SRT, or another configured OBS source.
- Require explicit confirmation before starting or stopping OBS Virtual Camera.
- Never claim that TikTok is live merely because OBS Virtual Camera is active.

See the complete [dual-PC production design and acceptance criteria](docs/PHASE_2_DUAL_PC_PRODUCTION.md).

### Multi-computer and team workflows

- Name computers, select a default computer, and organize multiple OBS devices.
- Show device health and version information in one view.
- Add optional team roles and permissions without weakening account isolation.
- Maintain an audit history of remote actions.

### Installation and updates

- Publish only signed Windows installers after signing approval.
- Provide signed update notifications and checksum verification.
- Support a trusted OBS plugin distribution or plugin-manager flow where technically available.
- Make upgrades preserve pairing, OBS connection settings, and creator workflows.

Phase 2 remote actions will remain allowlisted. Features that can interrupt or publish a live production will require clear user confirmation, account authorization, and auditable execution.

## If setup needs attention

- In OBS, open **Docks → OBS Creator Assistant**.
- Select **Open Setup** to view connection status and the pairing code.
- If OBS reports that the assistant is offline, select **Start Assistant**, wait a few seconds, and select **Refresh**.
- Installer logs are saved by Windows Setup and can be attached to a GitHub support issue if installation fails.

## Security boundaries

- The desktop helper and local MCP bridge listen only on `127.0.0.1`.
- OBS credentials remain on the Windows computer.
- A separate random bridge token is generated automatically.
- Local MCP requests require the bearer token.
- Hosted commands are restricted to the smaller remote allowlist documented above.
- Devices are isolated by authenticated account ownership.
- WebSocket and HTTP payload sizes are capped.
- Custom workflows accept only the documented action types.

Anyone who gains access to your authenticated account, local bridge token, or device credentials may be able to control the allowlisted OBS actions. Protect those credentials like passwords.

See the [privacy statement](PRIVACY.md) for the information transferred when the hosted connection is enabled.

## Code signing policy

The project has applied for free open-source code signing through SignPath. Approval is pending. Until approval and signing verification are complete, unsigned installers are not published.

If accepted, code signing will be provided by [SignPath.io](https://about.signpath.io/) with a certificate issued by [SignPath Foundation](https://signpath.org/).

See the full [code signing policy](CODE_SIGNING_POLICY.md), including team roles and verification requirements.

## Development

Requirements: Node.js 22 or newer and pnpm 11.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm start
```

End users should wait for an approved, signed Windows release rather than installing CI artifacts or unsigned packages.
