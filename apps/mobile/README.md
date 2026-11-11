# PublyApp mobile (v0)

Expo app for Android, tried in **Expo Go**. Sign in with PublyApp's real auth,
pick an organisation, read its posts. Read-only: no writes, no push, no store
build (issue #2361).

## Versions (pinned to what Expo Go on the Play Store runs today)

| Package      | Version    | Why                                                                 |
| ------------ | ---------- | ------------------------------------------------------------------- |
| expo         | `~58.0.23` | SDK 58, released 2026-10-15 — Expo Go supports only the current SDK |
| react-native | `0.88.1`   | SDK 58's bundled version                                            |
| react        | `19.3.0`   | SDK 58's bundled version                                            |
| expo-router  | `~58.0.30` | SDK 58's bundled version                                            |
| nativewind   | `4.2.7`    | stable; v5 is still a release candidate                             |
| tailwindcss  | `3.4.19`   | NativeWind 4 targets Tailwind 3                                     |
| typescript   | `~6.0.3`   | Expo SDK 58's expected TypeScript                                   |

`expo-secure-store`, `expo-linking`, `expo-constants`, `expo-status-bar`,
`react-native-safe-area-context` and `react-native-screens` are pinned from
`expo@58.0.23`'s `bundledNativeModules.json`, not guessed.

## Run it on the phone

1. Install **Expo Go** from the Play Store (SDK 58 build).
2. Start the API on your PC (see "Reaching the API from the phone" below) and
   note your PC's LAN IP: `ip route get 1 | awk '{print $7; exit}'`.
3. From the repo root:

   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.x.x:5000 pnpm --filter mobile start --tunnel
   ```

   `--tunnel` is what makes the Metro bundle reachable when the phone is not on
   the same Wi-Fi as the PC (Expo offers to install `@expo/ngrok` the first time).
   Scan the QR code with Expo Go.

4. Sign in with a real tenant account, pick an organisation, read the posts.

`EXPO_PUBLIC_API_URL` is read at bundle time (Expo inlines `EXPO_PUBLIC_*`), so
restart Metro after changing it. On the phone it must be the PC's LAN IP or a
public tunnel URL — `localhost` means the phone itself, not your PC.

Optional header overrides for a deployment that renames the auth headers:
`EXPO_PUBLIC_SESSION_HEADER` (default `X-Session-Token`) and
`EXPO_PUBLIC_TENANT_HEADER` (default `X-PublyApp-TenantId`).

## Reaching the API from the phone

**Finding: the dev API listens on loopback only.** `apps/api/Properties/launchSettings.json`
sets `applicationUrl` to `http://localhost:5000` and `just dev` launches the API
through that profile, so a phone on the LAN cannot open it. The API's CORS policy
(`apps/api/Lib/ServiceRegistration.cs`) only allows `FRONT_URL`, but that does not
matter here: React Native's `fetch` is not a browser and sends no `Origin`/preflight,
so CORS never blocks the app.

Pick one of these, no API code change needed:

- **USB, zero change:** plug the phone in with USB debugging, then
  `adb reverse tcp:5000 tcp:5000` and use `EXPO_PUBLIC_API_URL=http://localhost:5000`.
  `adb reverse` makes the phone's `localhost:5000` reach the PC.
- **LAN:** make Kestrel bind all interfaces, e.g.
  `ASPNETCORE_URLS=http://0.0.0.0:5000 just dev-api` (the `just dev` AppHost path
  launches through the launch profile, so the durable fix is changing
  `applicationUrl` there to `http://0.0.0.0:5000` — deliberately not done in this
  task). Then use `EXPO_PUBLIC_API_URL=http://192.168.x.x:5000`.
- **Tunnel:** expose port 5000 with `cloudflared tunnel --url http://localhost:5000`
  and use the printed HTTPS URL.

## Auth contract used (traced from the API, not guessed)

| Step              | Request                                                           | Response                                                            |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sign in           | `POST /auth/login` `{ "email", "password" }`                      | `{ userId, sessionToken, sessionExpiresAt, sessionExpiresInMs }`    |
| Pick organisation | `GET /auth/tenants-for-picker` + `X-Session-Token`                | `{ tenants: [{ id, name, code, status }], … }`                      |
| Read posts        | `GET /posts?limit=20` + `X-Session-Token` + `X-PublyApp-TenantId` | `{ data: [{ id, status, bodyPreview, createdAt, … }], nextCursor }` |

- The session token is stored with `expo-secure-store`; it is never logged.
- `401` clears the token and returns to sign-in; `403` never signs out (same rule
  as the web app).
- Error text on every screen comes from the RFC 7807 problem body's `translationKey`, translated with `response-message.*.json` (never the English `detail`).
- HTTP is a small typed `fetch` wrapper (`src/lib/api/client.ts`), not Kiota:
  the generated client pulls `@microsoft/kiota-abstractions` plus serializers that
  need Node/Web polyfills React Native does not ship. Revisit when the mobile app
  grows past two endpoints.

## Language

Strings come from `packages/shared-ts/src/lib/i18n/json/` (same FR/EN files as the web
app; mobile-only keys are prefixed `mobile-` in `common`). Default is the phone
language (French when it is neither FR nor EN). The choice is made on the sign-in
screen or in Settings, and saved in `expo-secure-store` (`publy.language`).

## Layout

```
src/app/_layout.tsx      root layout: providers + session guard
src/app/index.tsx        routing after hydrate (tenants or posts)
src/app/sign-in.tsx      email + password
src/app/tenants.tsx      organisation picker
src/app/posts.tsx        read-only posts list
src/app/settings.tsx     language choice (Français / English) + sign out
src/lib/i18n/            i18next setup, phone-language default, saved choice
src/lib/api/             typed fetch wrapper + wire types
src/lib/auth/            secure-store session + auth context (401 rule)
src/components/          screen states + root navigator
```

## Config files, and why two are not TypeScript

`metro.config.js` and `babel.config.json` are tool configuration, not
application code. Babel only loads `babel.config.json`/`.js` (JSON is used here).
Metro's TypeScript config support is new and unproven with NativeWind's CommonJS
`withNativeWind`, so `metro.config.js` stays CommonJS on purpose. Everything
under `src/` is TypeScript, strict.

Metro needs no monorepo `watchFolders`/`nodeModulesPaths`: since SDK 52
`expo/metro-config` detects the pnpm workspace itself (Expo's monorepo guide).

## Gates

```bash
pnpm --filter mobile typecheck
pnpm exec oxlint --quiet apps/mobile
pnpm exec oxfmt --check "apps/mobile/**/*.{ts,tsx,json}"
pnpm exec knip
pnpm exec expo export --platform android   # from apps/mobile, via heavy.sh
```
