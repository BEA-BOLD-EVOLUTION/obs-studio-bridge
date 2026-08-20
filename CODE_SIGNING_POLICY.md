# Code signing policy

OBS Creator Assistant uses a controlled, reviewable build and release process for Windows artifacts.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Team roles

- Committer and reviewer: [BEA-BOLD-EVOLUTION](https://github.com/BEA-BOLD-EVOLUTION)
- Signing approver: [BEA-BOLD-EVOLUTION](https://github.com/BEA-BOLD-EVOLUTION)
- Security contact: [bea@boldevolution.net](mailto:bea@boldevolution.net)

All maintainers and signing users must use multifactor authentication. Changes from outside contributors require review by a maintainer. A signing request requires a separate manual approval after the automated build and security checks succeed.

## Build and release controls

- Release artifacts are built by GitHub Actions from a specific reviewed commit.
- Dependencies are locked, and the build runs type checks, production dependency auditing, native builds, and payload validation.
- The payload rejects PowerShell, VBS, CMD, and batch launchers.
- The upstream Node.js executable must have a valid Authenticode signature before packaging.
- The project's native launcher, OBS plugin DLL, and final installer are the only project-produced Windows binaries submitted for signing.
- Unsigned CI artifacts are retained only as private workflow artifacts for signing review; they are not published as GitHub Releases.
- Published releases include a SHA-256 checksum and identify the source commit.

## User-visible system changes

The Windows installer:

- installs the local companion under the current user's local application-data directory;
- installs the OBS plugin under the shared OBS plugin directory;
- creates a clearly named Startup-folder shortcut so the companion starts after user sign-in;
- starts a local companion that listens only on `127.0.0.1`; and
- includes an uninstaller that removes the installed plugin and startup shortcut.

The installer does not disable antivirus, create antivirus exclusions, use scheduled tasks, bypass PowerShell execution policy, or execute hidden VBS/PowerShell/CMD launch scripts.

## Privacy

See [PRIVACY.md](PRIVACY.md). The software does not transfer information to networked systems unless the user installs it and connects the hosted Creator Assistant service. The OBS WebSocket password and local bridge token remain on the user's computer.

