import { StrictMode, startTransition } from 'react';

import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';
import { NonceProvider } from './hooks/use-nonce';
import { initApiClientOnClient } from './lib/api';
import { initI18nOnClient } from './lib/i18n/init-i18n.client';
import { initZodOnClient } from './lib/zod/zod.client';

const hydrate = async () => {
	const i18n = await initI18nOnClient();
	initZodOnClient(i18n);
	initApiClientOnClient(i18n);

	// Get nonce from meta tag or generate a fallback
	const nonceMeta = document.querySelector('meta[name="csp-nonce"]');
	const nonce = nonceMeta?.getAttribute('content') || '';

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<NonceProvider value={nonce}>
					<I18nextProvider i18n={i18n}>
						<HydratedRouter />
					</I18nextProvider>
				</NonceProvider>
			</StrictMode>,
		);
	});
};

if (window.requestIdleCallback) {
	window.requestIdleCallback(hydrate);
} else {
	// Safari doesn't support requestIdleCallback
	// https://caniuse.com/requestidlecallback
	window.setTimeout(hydrate, 1);
}
