# Security policy

## Supported versions

Security updates are provided for the latest published release.

## Reporting a vulnerability

Report vulnerabilities privately to the publisher through the same channel where you received this package. Do not include passwords, bearer tokens, tunnel credentials, or other secrets in a public issue.

## Credential handling

- Use different values for OBS_WEBSOCKET_PASSWORD and BRIDGE_AUTH_TOKEN.
- Keep .env and tunnel credential files private.
- Rotate the bridge token after suspected exposure.
- Do not expose the bridge port directly to the public internet.