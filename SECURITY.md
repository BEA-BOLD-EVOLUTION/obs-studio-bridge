# Security policy

## Supported versions

Security updates are provided for the latest published release.

## Reporting a vulnerability

Report vulnerabilities privately to the publisher through the same channel where you received this package. Do not include passwords, bearer tokens, tunnel credentials, or other secrets in a public issue.

## Credential handling

- Signed Windows installs generate the bridge token with the Windows cryptographic RNG and protect it with user-scoped DPAPI. The normal creator flow does not create `.env` or tunnel credential files.
- Use different values for OBS_WEBSOCKET_PASSWORD and BRIDGE_AUTH_TOKEN in developer environments.
- `.env` and tunnel credential files are supported only by developer/test harnesses and must remain private.
- Rotate the bridge token after suspected exposure.
- Do not expose the bridge port directly to the public internet.
