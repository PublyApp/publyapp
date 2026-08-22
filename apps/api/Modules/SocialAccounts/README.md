# Modules/SocialAccounts

C1 seam (#640, Epic C #630). Ships **only**:

- `Entities/SocialAccount` (+ `SocialProvider`, `SocialAccountStatus` enums), its EF
  configuration and the `AddSocialAccounts` migration
- `Services/ITokenProtector` + ``ITokenProtector` ships as `TokenProtector` (ASP.NET Data Protection,
  persisted key ring under `FILE_STORAGE_ROOT/.data-protection/keys`; registered in
  `Lib/ServiceRegistration.cs`)

**Deliberately absent until C2 (#641):** endpoints, handlers, permission wiring, and the
Bluesky client/connector. Do not add them to this module without moving to that slice.

## Seam contract

1. Consumers store only `ITokenProtector.Protect(purpose, plaintext)` output in
   `SocialAccount.ProtectedCredentials`. The plaintext (access/refresh tokens) must never
   reach the database or logs.
2. `purpose` is a stable lowercase identifier per credential domain (e.g.
   `bluesky.credentials`). Purposes are cryptographically isolated: a payload protected
   for one purpose cannot be unprotected with another.
3. Tamper evidence is guaranteed by authenticated encryption — a modified payload makes
   `Unprotect` throw (`CryptographicException`); it never returns garbage. Treat a throw
   as "reconnect needed" (`SocialAccountStatus.NeedsReconnect`), not as data corruption
   of unrelated rows.
4. The key ring MUST persist across deploys (volume-backed). Losing it makes every stored
   `ProtectedCredentials` value permanently undecryptable — see `.env.example`
   (Storage section) and `dokploy.yml` volume comments.

## Tests

- `Services/TokenProtectorSpec.cs` — pure unit specs (ephemeral key ring):
  round trip, tamper → throws, purpose isolation, empty-purpose guard.
- `Migrations/AddSocialAccounts.Spec.cs` — migration applies on the shared Testcontainers
  Postgres like neighbouring migration specs.
