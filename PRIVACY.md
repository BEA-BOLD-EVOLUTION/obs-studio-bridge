# Privacy statement

Last updated: August 20, 2026

OBS Creator Assistant is open-source software maintained by TPC Global LLC. This statement describes the information handled by the desktop companion, OBS plugin, OAuth interface, and hosted relay.

## Information that stays on the computer

- OBS WebSocket address and password
- the randomly generated local bridge token
- the local process identifier and local configuration file

These values are used to connect the companion to OBS on the same computer. The OBS password and local bridge token are not intentionally sent to the hosted relay.

## Information transferred when the hosted connection is enabled

- the computer hostname as a user-facing device name;
- a random device identifier, hashed device credential, pairing status, and timestamps;
- the account email and authentication identifiers managed by the configured authentication provider;
- allowlisted OBS command requests and their results while ChatGPT is actively used; and
- ordinary service metadata that hosting providers may process, such as IP address, request time, and diagnostic logs.

OBS status and scene information is transferred only in response to an authenticated request. The companion does not provide arbitrary OBS WebSocket access to the hosted service.

## Service providers

The hosted connection currently uses Railway for application hosting and Supabase for account authentication and device records. Their own privacy and retention terms may apply to infrastructure metadata.

## Retention and control

Device records are retained while associated with an account or until revoked or deleted as part of account administration. Transient command requests are held in memory only while a request is being completed, except for diagnostic information retained by infrastructure providers. Users can revoke a paired device and uninstall the local software.

## Security

The local HTTP services bind to `127.0.0.1`. Remote actions are limited to an explicit allowlist, device credentials are randomly generated, and pairing codes expire.

## Contact

Questions or deletion requests may be sent to [bea@boldevolution.net](mailto:bea@boldevolution.net).

