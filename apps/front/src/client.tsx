import { RouterProvider } from '@tanstack/react-router';
import { hydrateStart } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

const cspNonce =
	document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ??
	undefined;

startTransition(() => {
	void hydrateStart().then((router) => {
		router.options.ssr = {
			...router.options.ssr,
			nonce: cspNonce,
		};

		hydrateRoot(
			document,
			<StrictMode>
				<RouterProvider router={router} />
			</StrictMode>,
		);
	});
});
