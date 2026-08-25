Status: Historical — not normative
Original location: docs/misc/deployment-guide.md
Archive reason: Retired deployment guide retained because an archived README design depends on its point-in-time workflow.
Superseded by: docs/deployment/production-deployment-design.md and docs/deployment/production-deploy-runbook.md.

# Deployment Guide (Dokploy Artifact Pipeline)

> **SUPERSEDED:** This document is superseded by [Production Deployment & Migration Design](./../deployment/production-deployment-design.md).

This repo supports a “build locally, then upload artifacts to Dokploy” workflow.

The pipeline builds:
- **Front (SSR)**: `apps/front/build/**` + `apps/front/server.js`
- **API (.NET)**: `dotnet publish` output

Each artifact is bundled with a **generated `Dockerfile`** at the artifact root so Dokploy can build and run it without relying on Nixpacks auto-detect.

## Build artifacts (no upload)

```bash
# builds + assembles artifacts under .dump/
make build-deploy
```

Or:

```bash
pnpm deploy:artifacts
```

Outputs:
- `.dump/deploy-artifacts/<release>/front/`
- `.dump/deploy-artifacts/<release>/api/`

`<release>` defaults to the current git sha (or a timestamp when git is unavailable). Override with `RELEASE_ID`.

## Upload + deploy in Dokploy

Uploads are handled via the **programmatic API** from `dokploy-from-source`.

```bash
# build+upload both
make deploy

# front only
make deploy-front

# api only
make deploy-api
```

## Dokploy config + auth

This repo uses `dokploy-from-source` config/auth:
- `dfs.config.cjs` in the repo root
- `~/.config/dfs/auth.json` (managed by the `dfs` CLI via `dfs auth`)

Then the deploy script calls the library with `appName` (defaults: `front` + `api`) and overrides `localPath` to the generated artifact directory.

If your `dfs.config.cjs` uses different app keys:

```powershell
node scripts/deploy.mjs --target front --upload --front-app-name web
```

## Notes

- The front artifact preserves the pnpm workspace structure so `workspace:*` dependencies can be installed in the container.
- Workspace packages are copied as a **skeleton**: `package.json` + `scripts/` (if present). This keeps artifacts small while still allowing pnpm workspace resolution.
- The front artifact patches its copied root `package.json` to remove `scripts.prepare` (husky) so `pnpm install --prod` inside the container doesn’t fail.
- The generated front `Dockerfile` starts the SSR server from `apps/front/` (required because `server.js` serves `build/**` using relative paths).
- The API artifact uses a runtime image and runs the locally published `PublyApp.Api.dll`.
