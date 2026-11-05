/**
 * Type contract for the built server bundle (`dist/server/server.js`),
 * consumed by the production entry `server.ts` through the `#server-build`
 * package-imports alias declared in `package.json`.
 *
 * Why this file exists (#1758). `server.ts` is the production entry — it is
 * copied into the front image and launched with `node server.ts` — and is
 * typechecked as plain TypeScript since #2306. This file supplies its only
 * unresolved edge: the relative import
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
