# Phase 2 Test Plan

## Scope

This plan covers the Phase 2 path from ChatGPT through the hosted relay and local companion to OBS Virtual Camera, followed by the creator-managed handoff to TikTok LIVE Studio.

## Coverage targets

- 100% of remote tool names covered by allowlist acceptance or rejection tests.
- 100% of state-changing Virtual Camera actions covered for active, inactive, delayed, failed, and repeated states.
- 100% of hosted Virtual Camera actions covered for confirmation enforcement.
- At least one Windows integration run against every OBS major version supported by the installer.
- At least one end-to-end test for portrait and landscape TikTok LIVE Studio layouts before Phase 2 release.

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
- Validate ChatGPT submission metadata for all three tools.

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

## TikTok LIVE Studio acceptance tests

On the same Windows computer as the Camera/Compositor OBS instance:

1. Add a Camera source in TikTok LIVE Studio and select **OBS Virtual Camera**.
2. Start Virtual Camera through OBS Creator Assistant after confirmation.
3. Verify the composed OBS scene appears in TikTok's preview.
4. Test portrait framing.
5. Test landscape framing.
6. Test audio separately with TikTok LIVE Studio's audio test.
7. Confirm the assistant never reports TikTok as live based only on Virtual Camera state.
8. End any TikTok LIVE in TikTok LIVE Studio, then confirm and stop Virtual Camera through the assistant.

Do not use a public TikTok broadcast for routine automated testing. Use TikTok's preview and local test capabilities unless a controlled account and explicit broadcast authorization are provided.

## Current gaps

- Automated tests use a fake OBS request adapter; a real OBS integration runner is still required.
- TikTok LIVE Studio does not expose a documented control API used by this project, so preview and audio validation remain manual.
- Health monitoring is currently an on-demand snapshot; scheduled notifications and a real two-computer soak test remain future work.
- Dual-PC role assignment, presets, readiness coordination, and failure compensation are subsequent Phase 2 slices.
- No signed Phase 2 Windows beta can be distributed until the code-signing path is approved and verified.
