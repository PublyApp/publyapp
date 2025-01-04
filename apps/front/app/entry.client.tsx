import { startTransition, StrictMode } from 'react';

import i18next from 'i18next';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';

import { initApiClient } from './lib/api';
import { initI18nOnClient } from './lib/i18n/initI18n.client';

const hydrate = async () => {
	await initI18nOnClient();
	initApiClient.onClient();

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<I18nextProvider i18n={i18next}>
					<HydratedRouter />
				</I18nextProvider>
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
