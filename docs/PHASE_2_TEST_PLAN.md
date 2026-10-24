# Phase 2 Test Plan

## Scope

This plan covers the Phase 2 path from ChatGPT through the hosted relay and local companion to camera discovery, multi-camera OBS layouts, OBS Virtual Camera, and the creator-managed handoff to TikTok LIVE Studio.

## Coverage targets

- 100% of remote tool names covered by allowlist acceptance or rejection tests.
- 100% of state-changing Virtual Camera actions covered for active, inactive, delayed, failed, and repeated states.
- 100% of hosted Virtual Camera actions covered for confirmation enforcement.
- At least one Windows integration run against every OBS major version supported by the installer.
- At least one end-to-end test for portrait and landscape TikTok LIVE Studio layouts before Phase 2 release.
- At least one Windows camera-discovery run with a physical camera and a virtual camera when both are available.

## Automated tests

### Unit tests

- Read active and inactive Virtual Camera state.
- Start from inactive and verify the resulting active state.
- Stop from active and verify the resulting inactive state.
- Treat repeated start and stop requests as idempotent no-ops.
- Tolerate bounded asynchronous OBS state changes.
- Fail when OBS accepts a request but never reaches the requested state.
- Reject arbitrary or toggle-style remote tools.
- Require explicit confirmation for hosted start and stop commands.
- Permit read-only inspection without confirmation.
- Validate ChatGPT submission metadata for every exposed tool.
- Separate physical camera candidates from virtual-camera devices and filter scanner, printer, and fax devices.
- Reject missing, duplicate, unknown, or excessive camera inputs for layout creation.
- Create fullscreen, side-by-side, picture-in-picture, three-camera, and grid transforms for portrait and landscape canvases.
- Verify every created scene-item transform and fail rather than claim completion when verification differs.
- Require explicit confirmation before creating a camera layout or opening TikTok LIVE Studio.
- Permit camera discovery and TikTok LIVE Studio inspection without confirmation.

### Relay contract tests

- Dispatch the fixed local tool for each supported action.
- Preserve the authenticated account token and selected device ID.
- Reject unsupported action names before dispatch.
- Verify that missing or false confirmation cannot dispatch a state-changing command.
- Verify a dual-PC health snapshot dispatches only read-only status and performance commands to the two session-owned computers.
- Verify CPU, FPS, render-lag, encoding-lag, offline-device, and inactive-Virtual-Camera warnings remain separated by role.
- Verify health results explicitly decline to claim that a transport-independent inter-PC video signal was validated.
- Verify role-specific updates select only the device ID stored for that role in the account-owned active session.
- Verify scene and source-visibility updates capture prior state, avoid duplicate commands, and remain restorable in reverse order.
- Verify a failed or uncertain update attempts immediate compensation and marks the session for manual attention when compensation cannot be confirmed.
- Verify role-specific audio updates inspect one existing input, accept only mute or -100 dB to +26 dB volume targets, and never change TikTok LIVE Studio audio.
- Verify mute and volume updates capture their prior values, avoid duplicates, compensate uncertain results, and remain restorable when production stops.

### CI checks

- TypeScript strict type check.
- Production build.
- Local companion tests.
- Hosted relay tests.
- Production dependency audits.
- Existing native plugin and Windows installer builds.

## Windows OBS integration tests

Run on a Windows test computer with OBS WebSocket authentication enabled:

1. Verify that status reports unavailable when OBS Virtual Camera is not installed or exposed.
2. Verify inactive status with Virtual Camera installed.
3. Start Virtual Camera and confirm the OBS control changes to **Stop Virtual Camera**.
4. Confirm that the tool reports active.
5. Repeat start and confirm no toggle or error occurs.
6. Stop Virtual Camera and confirm inactive status.
7. Repeat stop and confirm no toggle or error occurs.
8. Disconnect OBS during verification and confirm the result is a failure, not success.
9. Reconnect and confirm status recovery.

## Windows camera and layout integration tests

Run on a Windows test computer with at least one camera already added to OBS as a **Video Capture Device**:

1. Ask the assistant to identify connected cameras without changing OBS.
2. Confirm that physical cameras and virtual cameras are shown separately.
3. Confirm that scanners, printers, and fax devices are not offered as cameras.
4. Ask the tester to label the devices as **Main**, **Overhead**, **Side**, **Pet Cam**, **Phone**, or custom roles; confirm the assistant does not guess.
5. Create each supported layout only after the tester confirms the exact scene name and OBS camera inputs.
6. Verify that the new scene uses the current canvas dimensions and that every camera is visible and correctly placed.
7. Repeat at `1080x1920` and `1920x1080`.
8. Confirm existing scenes and inputs were not deleted or renamed.
9. Request a layout with a missing or duplicate input and confirm no scene changes are made.
10. Disconnect a camera and confirm the assistant reports the issue without claiming that a usable preview was verified.

## TikTok LIVE Studio acceptance tests

On the same Windows computer as the Camera/Compositor OBS instance:

1. Inspect TikTok LIVE Studio and verify the assistant accurately reports installed/running state without opening it.
2. Ask the assistant to open LIVE Studio, confirm the action, and verify the installed app starts.
3. Confirm the assistant does not enter credentials, click settings, or start a LIVE.
4. Add a Camera source in TikTok LIVE Studio and select **OBS Virtual Camera**.
5. Start Virtual Camera through OBS Creator Assistant after confirmation.
6. Verify the composed OBS scene appears in TikTok's preview.
7. Test portrait framing.
8. Test landscape framing.
9. Test audio separately with TikTok LIVE Studio's audio test.
10. Confirm the assistant never reports TikTok as live based only on Virtual Camera state.
11. End any TikTok LIVE in TikTok LIVE Studio, then confirm and stop Virtual Camera through the assistant.

Do not use a public TikTok broadcast for routine automated testing. Use TikTok's preview and local test capabilities unless a controlled account and explicit broadcast authorization are provided.

## Current gaps

- Automated tests use a fake OBS request adapter; a real OBS integration runner is still required.
- TikTok LIVE Studio does not expose a documented control API used by this project, so preview and audio validation remain manual.
- The current guarded desktop integration can inspect and open TikTok LIVE Studio, but it does not click in-app controls, sign in, select sources, or start/end a LIVE.
- Windows device discovery cannot safely supply an OBS DirectShow `video_device_id`; a camera must already be configured as an OBS input before layout creation.
- Health monitoring is currently an on-demand snapshot; scheduled notifications and a real two-computer soak test remain future work.
- Dual-PC role assignment, presets, readiness coordination, and failure compensation are subsequent Phase 2 slices.
- No signed Phase 2 Windows beta can be distributed until the code-signing path is approved and verified.
