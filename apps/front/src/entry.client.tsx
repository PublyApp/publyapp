import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';

import { logger } from '@/shared/lib/logger/iso-logger';
import { LogLevelEnum } from '@/shared/lib/logger/logger.utils';

import { NonceProvider } from './hooks/use-nonce-context';
import { initI18nOnClient } from './lib/i18n/init-i18n.client';
import { initZodOnClient } from './lib/zod/zod.client';

const isDevelopment = import.meta.env.DEV;

const hydrate = async () => {
	if (isDevelopment) {
		logger.logLevel = LogLevelEnum.DEBUG;
	} else {
		logger.logLevel = LogLevelEnum.WARN;
	}

	const i18n = await initI18nOnClient();
	initZodOnClient(i18n);

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
