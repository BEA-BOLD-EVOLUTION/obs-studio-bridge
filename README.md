# OBS Creator Assistant

OBS Creator Assistant connects OBS Studio to ChatGPT through a secure local companion and a native OBS dock.

## Install on Windows

Public Windows installer downloads are temporarily paused while the project completes independent open-source code-signing review. Do not download the retired v1.3.0 installer from mirrors or third-party sites.

After signing approval:

1. Download **OBS-Creator-Assistant-Setup.exe** only from the [official releases page](https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge/releases).
2. Close OBS Studio.
3. Double-click the installer and approve the Windows prompt.
4. Reopen OBS Studio and choose **Docks → OBS Creator Assistant**.

That one installer adds both the OBS plugin and the desktop helper, detects the local OBS WebSocket settings, starts the helper automatically with Windows, and opens the connection screen. Existing connection settings are preserved when upgrading.

No ZIP extraction, terminal, Node.js installation, token generation, or manual file editing is required.

## What it can do

- Inspect OBS status, scenes, sources, audio, video settings, and performance.
- Switch scenes and control source visibility.
- Mute inputs and adjust audio volume.
- Start or stop streaming and recording.
- Save the replay buffer.
- Run allowlisted creator workflows.

The assistant cannot execute arbitrary OBS WebSocket requests.

## If setup needs attention

- In OBS, open **Docks → OBS Creator Assistant**.
- Select **Open Setup** to view connection status and the pairing code.
- If OBS reports that the assistant is offline, select **Start Assistant**, wait a few seconds, and select **Refresh**.
- Installer logs are saved by Windows Setup and can be attached to a GitHub support issue if installation fails.

## Security boundaries

- The desktop helper listens only on `127.0.0.1`.
- OBS credentials remain on the Windows computer.
- A separate random bridge token is generated automatically.
- Remote commands are restricted to the assistant's allowlist.
- WebSocket and HTTP payload sizes are capped.

Anyone who obtains the bridge token and can reach the hosted connection can control the allowlisted OBS actions. Protect account access like a password.

See the [privacy statement](PRIVACY.md) for the information transferred when the hosted connection is enabled.

## Code signing policy

Windows releases are built from this public repository and require manual approval before signing. Unsigned installers are never published as releases.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

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

End users should install the latest Windows release instead of building from source.

