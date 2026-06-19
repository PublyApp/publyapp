import {
	createStartHandler,
	defaultStreamHandler,
	defineHandlerCallback,
} from '@tanstack/react-start/server';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

// Custom TanStack Start server entry (Task 3.1).
//
// WHY: the enforced + report-only `Content-Security-Policy` headers must be present on
// EVERY SSR'd HTML response — including 404 / 500 / error pages, which still ship the
// framework's hydration scripts. Minting the nonce + calling `setResponseHeader` inside
// `getRouter` set the headers on 200 responses but they did NOT survive to the 404 path
// (the non-OK response is finalized through a path that drops them). The stream handler
// below runs for ALL rendered responses, so setting the headers here is status-agnostic.
//
// The per-request nonce lives on `router.options.ssr.nonce` (minted in `getRouter`); we
// read it here so the policy's `'nonce-..'` matches the scripts TanStack injects.
const cspStreamHandler = defineHandlerCallback((ctx) => {
	const nonce = ctx.router.options.ssr?.nonce;

	if (typeof nonce === 'string' && nonce.length > 0) {
		const cspPolicy = createCSPHeader({
			isDevelopment: process.env.NODE_ENV === 'development',
			nonce,
		});

		// Enforced is what the blocking test asserts; report-only mirrors it for parity
		// with the current `front` (header presence), not as a separate diagnostic policy.
		ctx.responseHeaders.set('Content-Security-Policy', cspPolicy);
		ctx.responseHeaders.set('Content-Security-Policy-Report-Only', cspPolicy);
	}

	return defaultStreamHandler(ctx);
});

const handleRequest = createStartHandler(cspStreamHandler);

export default {
	fetch(request: Request) {
		return handleRequest(request);
	},
};
