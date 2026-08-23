# Social accounts master key & boot canary

This guide covers the `SOCIAL_ACCOUNTS_MASTER_KEY` environment variable, the startup
witness/canary that guards it, and what is — and is not — verified on each process path.
It consolidates the C1-bis foundations shipped in #1239 plus the observability added in
#1284. Normative background: Epic C §4 (transparent failure causes) and
[`production-deployment-design.md`](../deployment/production-deployment-design.md)
(operations).

## The env var: `SOCIAL_ACCOUNTS_MASTER_KEY`

- **What it is:** a 32-byte AES-256-GCM key, generated with `openssl rand -base64 32`.
  Parsed once at startup by `AppEnvironment.ParseMasterKey`; base64-encoded in env.
- **Where it lives:** `.env.development` locally (template placeholder in
  `.env.example`); a Dokploy secret injected into **all three** deployed services —
  `publyapp-api`, `publyapp-worker`, and `publyapp-migrate` — in production.
- **Why it must be identical everywhere:** it protects the ASP.NET Data Protection key
  ring persisted to Postgres (`DataProtectionKeys`). That ring encrypts every stored
  social credential (`social_accounts.protected_credentials`). A key that differs between
  api and worker means one of them cannot decrypt what the other encrypted.
- **Loss impact:** with no key (or a wrong one) the API/worker refuse to start. Any stored
  token encrypted under a lost key becomes unrecoverable; accounts move through
  reconnection to recover (see the design doc's recovery notes).

## The boot canary (startup witness)

`SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(...)` runs at every real boot,
before any request or job is served:

1. **Parse contract** (always): the key must exist and be exactly 32 bytes.
2. **Canary round-trip** (real boot only): on first boot the witness encrypts a known
   sentinel under the current key and persists it beside the Data Protection key ring
   (`data_protection_keys`, row `social-accounts-master-key-canary`, via
   `PostgresKeyRingCanaryStore`). Every later boot decrypts that persisted blob.
   - Same key value → decrypt succeeds → boot proceeds.
   - Right size but wrong value → AES-GCM authentication fails → the process refuses to
     start with a plain-words cause explaining the mismatch and the recovery options
     (restore the original value for ALL services, or deliberately rotate).

A pure in-memory encrypt/decrypt round-trip could never catch a wrong-value key, which is
why the sentinel is persisted and re-decrypted instead.

### Success is logged (#1284)

When the canary round-trip passes at real boot, the witness logs one Information line:

```
Social accounts master-key canary PASSED: SOCIAL_ACCOUNTS_MASTER_KEY decrypts the persisted key-ring canary; credential protection is verified for this process.
```

Both boot paths (web host api/all and worker) emit it, so an operator scanning container
logs sees explicit proof the key works, not merely the absence of a crash. The fail-loud
refusal paths are unchanged and stay silent about success.

## What the build-time OpenAPI path skips

`dotnet build` / `just build-api` / `just generate-client` RUN the app briefly to produce
the OpenAPI document (`Microsoft.Extensions.ApiDescription.Server`'s doc-gen tool). That
process has **no database**, so `Program.IsOpenApiGenerationProcess` detects it and passes
`canaryStore: null`: only the parse/size contract runs, and **the canary is skipped — no
canary pass line is logged either**.

Do not assume a green CI build exercised the canary. It never has. Only a real boot of the
api or worker role (local `just dev-api-migrated`, docker compose smoke, or the deployed
services) performs and logs the verification.

## Failure playbook

| Log/symptom | Meaning | Action |
| --- | --- | --- |
| `SOCIAL_ACCOUNTS_MASTER_KEY is missing or empty ... will not start` | Var absent/unset | Set it (32-byte base64) on all three services |
| `has the wrong size (...)` | Not exactly 32 bytes | Re-generate with `openssl rand -base64 32` |
| `does not match the master-key canary stored beside the Data Protection key ring` | Key VALUE differs from the one credentials were protected under | Restore the original value on api+worker+migrate, or follow the deliberate rotation steps in the message (re-protect credentials, delete the stale canary row `social-accounts-master-key-canary`) |
| No canary PASSED line in logs after deploy | Boot was refused earlier, OR you are looking at the doc-gen/build output (which never logs it) | Check the failing service's earlier log lines |

Related code: `apps/api/Modules/SocialAccounts/Infrastructure/SocialAccountsMasterKeyWitness.cs`
(+ its `*.Spec.cs` files, including `SocialAccountsMasterKeyBootLog.Spec.cs`), the call
sites in `apps/api/Program.cs`, and `AppEnvironment.ParseMasterKey`.
