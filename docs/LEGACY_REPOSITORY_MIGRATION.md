# OBS-TikTokLiveStudio migration inventory

Source repository: `BEA-BOLD-EVOLUTION/OBS-TikTokLiveStudio`

Canonical repository: `BEA-BOLD-EVOLUTION/obs-studio-bridge`

## Already represented in OBS Creator Assistant

- OBS connection and scene switching
- Virtual Camera controls
- Recording and streaming status
- Color-coded visual scene groups
- Camera discovery and verified multi-camera layouts
- TikTok LIVE Studio detection and launch
- Creator-facing setup and production-status UI

These should not be copied from the older repository.

## Migration sequence

1. **Media-source inspection and playback controls** — migrate now with resource validation, confirmation, remote allowlisting, and postcondition checks.
2. **Editable creator action catalog** — replace name-only scene heuristics with creator-approved labels for multiple jump scares, camera views, AI features, and custom actions.
3. **Lower thirds** — redesign the older Windows-only text-source prototype around inspection, preview, confirmation, and verified updates.
4. **Stream Deck mappings** — reuse the validated configuration ideas, but connect buttons to the current authenticated local companion instead of creating a second OBS connection.
5. **Scheduled workflows and scene recommendations** — evaluate only after action catalog persistence and rollback behavior exist.
6. **Audio ducking, adaptive quality, backups, cohost OCR, and other roadmap prototypes** — individually review for real OBS integration, safety, and acceptance coverage before migration.

## Explicitly deferred

- Arbitrary remote file paths or uploads into OBS media sources
- Automatic TikTok sign-in or Go LIVE actions
- Bulk copying the old web application or its separate OBS credential flow
- Archiving the source repository before migration is complete
