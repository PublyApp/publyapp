import { nanoid } from 'nanoid';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

// Mint a per-request CSP nonce. Header EMISSION lives in the custom server entry
// (`src/server.ts`), which calls `applyCspHeaders` below so EVERY SSR'd HTML response —
// including 404/500 — receives the headers (setting them per-request in `getRouter` did
// NOT survive to non-200 responses). The nonce is threaded to TanStack via
// `router.options.ssr.nonce` (see `router.tsx`), the only channel the framework reads.
export const mintCspNonce = (): string => nanoid();

// Set the enforced + report-only CSP headers (mirrored policy) for a given nonce. Pure
// (no server-only API), so it is unit-testable and the server entry stays a thin shim.
export const applyCspHeaders = (
	headers: Headers,
	nonce: string,
	isDevelopment: boolean,
): void => {
	const cspPolicy = createCSPHeader({ isDevelopment, nonce });

	headers.set('Content-Security-Policy', cspPolicy);
	// Byte-identical to enforced (no report endpoint) — header-presence/parity with the
	// current `front`, not a separate diagnostic policy.
	headers.set('Content-Security-Policy-Report-Only', cspPolicy);
};
