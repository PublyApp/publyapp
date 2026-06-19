import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { isServer } from '@org/shared-ts/lib/constants';

import { DefaultCatchBoundary } from './components/DefaultCatchBoundary';
import { NotFound } from './components/NotFound';
import { routeTree } from './routeTree.gen';
import { createCspForRequest } from './server/csp';

// The per-request CSP nonce. `router.options.ssr.nonce` is the ONLY channel TanStack
// Start reads to nonce the scripts it injects — React's SSR stream bootstrap, the
// `$tsr-stream-barrier`, buffered hydration scripts, and the `<Scripts>`/`ScriptOnce`
// output (see @tanstack/react-router Scripts.js / router-core ssr-server.js). A `nonce`
// prop on `<Scripts>` is ignored, so this is the load-bearing wiring for blocking CSP.
const resolveRequestNonce = (): string | undefined => {
	if (isServer) {
		// Server: mint the nonce AND set the CSP response headers in one shot.
		return createCspForRequest().nonce;
	}

	// Client (hydration): reuse the SSR nonce from the meta tag so client-rendered
	// <script>/<style> tags carry the same value as the server markup (no hydration
	// mismatch) and React Aria keeps reading a consistent nonce.
	if (typeof document !== 'undefined') {
		return (
			document
				.querySelector('meta[name="csp-nonce"]')
				?.getAttribute('content') ?? undefined
		);
	}

	return undefined;
};

export function getRouter() {
	const queryClient = new QueryClient();
	const nonce = resolveRequestNonce();

	const router = createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: 'intent',
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: () => <NotFound />,
		ssr: nonce ? { nonce } : undefined,
	});
	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
