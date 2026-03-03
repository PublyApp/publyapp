# Dokploy Artifact Pipeline (Local Build → Upload)

This repo supports a “build locally, then upload artifacts to Dokploy” workflow.

The pipeline builds:
- **Front (SSR)**: `apps/front/build/**` + `apps/front/server.js`
- **API (.NET)**: `dotnet publish` output

Each artifact is bundled with a **generated `Dockerfile`** at the artifact root so Dokploy can build and run it without Nixpacks auto-detect.

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

### Dokploy config

This pipeline does **not** require env vars for Dokploy.

Instead, configure `dokploy-from-source` once:

1) Create `dfs.config.cjs` at the repo root (or run `dfs init`).
2) Store your token via `dfs auth` (writes `~/.config/dfs/auth.json`).

Then the deploy script calls the library with `appName` (defaults: `front` + `api`) and overrides `localPath` to the generated artifact directory.

### `dfs.config.cjs` example

This repo uploads **artifact folders** that contain a `Dockerfile` at the artifact root, so the simplest config is a Dockerfile build type for both apps:

```js
// dfs.config.cjs
module.exports = {
  server: "https://your-dokploy-server.com",
  apps: {
    front: {
      appId: "YOUR_FRONT_APP_ID",
      build: { buildType: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "." },
    },
    api: {
      appId: "YOUR_API_APP_ID",
      build: { buildType: "dockerfile", dockerfile: "Dockerfile", dockerContextPath: "." },
    },
  },
};
```

Example:

```powershell
make deploy

# If your dfs.config.cjs uses different app keys:
node scripts/deploy.mjs --target front --upload --front-app-name web
```

## Notes

- The front artifact preserves the pnpm workspace structure so `workspace:*` dependencies can be installed in the container.
- Workspace packages are copied as a **skeleton**: `package.json` + `scripts/` (if present). This keeps artifacts small while still allowing pnpm workspace resolution.
- The front artifact patches its copied root `package.json` to remove `scripts.prepare` (husky) so `pnpm install --prod` inside the container doesn’t fail.
- The generated front `Dockerfile` starts the SSR server from `apps/front/` (required because `server.js` serves `build/**` using relative paths).
- The API artifact uses a runtime image and runs the locally published `MainApi.dll`.
