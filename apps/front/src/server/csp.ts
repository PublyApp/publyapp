import { createCSPHeader } from '@org/shared-ts/lib/csp';

import { mintCspNonce } from '../lib/csp-nonce';
import { getPublicEnv } from '../lib/env';

export { mintCspNonce };

const getPublicApiOrigin = (): string | undefined => {
	const publicApiBaseUrl = getPublicEnv().apiBaseUrl;

	try {
		const origin = new URL(publicApiBaseUrl).origin;
		if (origin === 'null') {
			return undefined;
		}
		return origin;
	} catch {
		return undefined;
	}
};

export const applyCspHeaders = (
	headers: Headers,
	nonce: string,
	isDevelopment: boolean,
): void => {
	const apiOrigin = getPublicApiOrigin();
	const cspPolicy = createCSPHeader({
		isDevelopment,
		nonce,
		additionalConnectSrc: apiOrigin ? [apiOrigin] : [],
	});

	headers.set('Content-Security-Policy', cspPolicy);
};
