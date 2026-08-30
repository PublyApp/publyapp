/**
 * Type contract for the built server bundle (`dist/server/server.js`),
 * consumed by the production entry `server.mjs` through the `#server-build`
 * package-imports alias declared in `package.json`.
 *
 * Why this file exists (#1758). `server.mjs` is the production entry — it is
 * copied into the front image and launched with `node server.mjs` — yet nothing
 * typechecked it: with no `allowJs` the `include` entry was decorative
 * (measured ZERO times in `tsc --listFiles`, #1692), and enabling `allowJs` on
 * the main tsconfig drags the build output `dist/server/assets/*.js` into the
 * program and breaks the gate (#1749). The dedicated `tsconfig.server.json`
 * checks `server.mjs` with `allowJs`/`checkJs` while excluding `dist/`, and
 * this file supplies the only unresolved edge: the relative import
 * `./dist/server/server.js` cannot be declared by an ambient module, and
 * `dist/` is a gitignored build artifact (a committed `.d.ts` under it would
 * be wiped by every `vite build`). The `imports` map therefore aliases the
 * specifier to a NON-relative name: at typecheck time the `types` condition
 * resolves to this file, at runtime Node ignores the unknown `types` condition
 * and resolves the `default` condition to the real bundle.
 *
 * This is a hand-written contract, so a drift between it and the bundle's real
 * shape is possible (e.g. a renamed named export). Any such drift surfaces at
 * container start (the CI "Smoke start front server" step) rather than at
 * typecheck time; that residual is stated rather than hidden.
 */

export interface ServerBuildHandler {
	fetch(request: Request): Promise<Response> | Response;
}

declare const handler: ServerBuildHandler;

export function validateRuntimeEnv(): void;

export default handler;
