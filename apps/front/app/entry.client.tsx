import { startTransition, StrictMode } from 'react';

import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import { initI18nOnClient } from './lib/i18n/init.client';

const hydrate = async () => {
	await initI18nOnClient();

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<HydratedRouter />
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
