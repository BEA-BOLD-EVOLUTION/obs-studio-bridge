# ADR-001: Consolidate OBS creator tooling into OBS Creator Assistant

**Status:** Accepted

**Date:** 2026-10-25

**Decider:** Bold Evolution Agency

## Context

Bold Evolution Agency has two overlapping repositories:

- `obs-studio-bridge`, the shipped OBS Creator Assistant with a signed Windows installer, native OBS plugin, authenticated ChatGPT connection, relay, and guarded production controls.
- `OBS-TikTokLiveStudio`, an earlier local web dashboard and Stream Deck scaffold with useful controller modules and a broad creator-workflow roadmap.

Maintaining two products with separate OBS connection layers would duplicate security, installation, testing, and support work. The earlier repository also contains prototypes whose completion labels do not mean they are integrated with the signed product or remotely operable through the current safety boundary.

## Decision

`obs-studio-bridge` is the canonical product and release repository. Useful capabilities from `OBS-TikTokLiveStudio` will be migrated incrementally behind the existing local companion and relay allowlist. Each migrated write action must validate named resources, require creator confirmation where appropriate, verify its postcondition, and remain bounded to the creator's linked OBS computer.

The older repository remains available as a migration source until its useful code, tests, and product requirements are accounted for. It will not be archived as part of this decision.

## Options considered

### Keep both products active

- Low initial migration effort.
- High long-term confusion, duplicated installers, duplicated OBS credentials, and inconsistent safety behavior.

### Make the older dashboard repository canonical

- Preserves its monorepo and UI structure.
- Discards the newer repository's signed installer, native plugin, OAuth/relay architecture, and current release process.

### Incrementally consolidate into OBS Creator Assistant

- Preserves the production-ready security and release foundation.
- Allows useful UI and workflow ideas to move only after they meet current verification and safety requirements.
- Requires deliberate migration work instead of a bulk copy.

## Consequences

- OBS Creator Assistant has one canonical installer and public release line.
- The old code is treated as reference material, not automatically trusted production code.
- Stream Deck, lower thirds, media actions, scheduled workflows, and other useful capabilities can be migrated in reviewable slices.
- Features described as complete in the old roadmap are not presented as complete in the current product until integration and acceptance testing pass.
