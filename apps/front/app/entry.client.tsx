import { startTransition, StrictMode } from 'react';

import i18next from 'i18next';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';

import { initApiClientOnClient } from './lib/api';
import { initI18nOnClient } from './lib/i18n/initI18n.client';
import { initZodOnClient } from './lib/zod';

const hydrate = async () => {
	const i18n = await initI18nOnClient();
	initZodOnClient(i18n);
	initApiClientOnClient(i18n);

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
