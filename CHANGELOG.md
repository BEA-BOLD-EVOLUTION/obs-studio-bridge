# Changelog

All notable changes to OBS Studio Bridge are documented here.

## Unreleased - Phase 2

- Added state-aware OBS Virtual Camera inspection, start, and stop tools for the TikTok LIVE Studio handoff.
- Added explicit confirmation requirements for hosted start and stop requests.
- Added Virtual Camera status to the general OBS readiness snapshot.
- Expanded the local companion's remote allowlist only for the three fixed Virtual Camera tools; arbitrary OBS calls and toggle requests remain blocked.
- Added unit and security-boundary tests for idempotency, postcondition verification, confirmation, and allowlisting.

## 1.0.0 - 2026-08-04

- Initial public release.
- Added bearer-authenticated, localhost-only Streamable HTTP MCP transport.
- Added allowlisted OBS inspection, scene, source, audio, streaming, recording, and replay tools.
- Added Windows setup scripts and local Codex configuration.
