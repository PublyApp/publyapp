import { nanoid } from 'nanoid';

// Mint a per-request CSP nonce. Header EMISSION lives in the custom server entry
// (`src/server.ts`) so EVERY SSR'd HTML response — including 404/500 — receives the
// enforced + report-only `Content-Security-Policy` headers (setting them per-request
// in `getRouter` did NOT survive to non-200 responses). The nonce is threaded to
// TanStack via `router.options.ssr.nonce` (see `router.tsx`), which is the only
// channel the framework reads to nonce the scripts it injects.
export const mintCspNonce = (): string => nanoid();
