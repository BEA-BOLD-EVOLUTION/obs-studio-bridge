# First-run setup

## Creator experience

The supported release flow is:

1. Install the signed Windows package.
2. Open OBS Studio and choose **Docks → OBS Creator Assistant**.
3. Choose **Set Up Creator Assistant**.
4. Let the assistant detect the production OBS WebSocket connection.
5. Choose **Program View**, **Viewer View**, or **Both**.
6. For Viewer View, choose AirPlay, software mirroring, hardware capture, or another existing OBS source.
7. Optionally choose **Approve and connect ChatGPT** and complete the one-time account approval.
8. Finish at **Ready**.

The installer adds the native OBS dock and starts the desktop companion without a console window. The companion starts with the signed-in Windows user. Creators are never asked to edit environment files, configuration profiles, bearer tokens, or credential files.

## Connection and authorization boundary

Local clipping works without linking a ChatGPT account. Account linking is a separate, explicit action in the wizard. The six-digit pairing code is short-lived and does not grant access until the creator approves the account connection.

The current production package uses the hosted Creator Assistant relay, so it does not need a creator-managed tunnel. A `tunnel-client` may only be bundled in a future official package after its redistribution terms and release provenance are approved. If that transport is enabled, its lifecycle must remain behind the same background companion and one-time approval screen; it must not reintroduce API-key text files, profiles, or visible terminal windows.

## Secret storage

Installed Windows builds generate 48 random bytes with the Windows cryptographic random-number generator. The desktop launcher protects them with user-scoped Windows Data Protection API (DPAPI) and stores only the encrypted blob under the application configuration directory. The decrypted bridge token exists only in the companion process environment.

Non-secret setup choices are stored separately in `config/creator-settings.json`. This file contains the clipping mode, viewer capture method, local Viewer OBS endpoint, and optional source name. It never contains the bridge token or an OBS password.

Production OBS and Viewer/Clipper OBS remain independent:

```text
Program View -> Production OBS (default local port 4455) -> its replay buffer
Viewer View  -> Viewer/Clipper OBS (default local port 4456) -> its replay buffer
Both         -> save both replay buffers
```

## Developer and test harnesses

`setup.ps1`, `start-bridge.ps1`, `start-tunnel.ps1`, `installer/Setup.cmd`, and `installer/install-creator.ps1` remain available for development, integration testing, and transport experiments. They are not included in the signed release payload and must not be presented as the creator installation path. The legacy installer harness now requires the explicit `-DeveloperHarness` switch.

## Release validation

Do not merge or publish the first-run experience until all of the following pass:

- TypeScript build and unit tests.
- Windows launcher build with warnings treated as errors.
- Native OBS plugin build.
- Signed-installer payload validation (including the no-script-launcher check).
- Clean-machine install, upgrade, uninstall, and Windows logon restart tests.
- OBS connection checks with WebSocket authentication enabled and disabled.
- Program, Viewer, and Both replay-buffer tests.
- One-time ChatGPT approval and refusal/cancel tests.
- Security review of DPAPI storage, localhost-only listeners, CSRF protection, and release signatures.
