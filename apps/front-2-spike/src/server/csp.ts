import { nanoid } from 'nanoid';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

const getPublicApiOrigin = (): string | undefined => {
	const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;

	if (!publicApiBaseUrl) {
		return undefined;
	}

	try {
		const origin = new URL(publicApiBaseUrl).origin;

		return origin === 'null' ? undefined : origin;
	} catch {
		return undefined;
	}
};

const appendConnectSrcOrigin = (
	policy: string,
	origin: string | undefined,
): string => {
	if (!origin) {
		return policy;
	}

	const directives = policy
		.split(';')
		.map((directive) => directive.trim())
		.filter(Boolean);

	for (let index = 0; index < directives.length; index += 1) {
		const parts = directives[index].split(/\s+/);

		if (parts[0] !== 'connect-src') {
			continue;
		}

		if (!parts.includes(origin)) {
			directives[index] = `${directives[index]} ${origin}`;
		}

		return directives.join('; ');
	}

	return [...directives, `connect-src 'self' ${origin}`].join('; ');
};

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
	const cspPolicy = appendConnectSrcOrigin(
		createCSPHeader({ isDevelopment, nonce }),
		getPublicApiOrigin(),
	);

	headers.set('Content-Security-Policy', cspPolicy);
	// Byte-identical to enforced (no report endpoint) — header-presence/parity with the
	// current `front`, not a separate diagnostic policy.
	headers.set('Content-Security-Policy-Report-Only', cspPolicy);
};
