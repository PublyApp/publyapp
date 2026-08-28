import { randomBytes } from 'node:crypto';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

import { getPublicEnv } from '../lib/env';

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

export const mintCspNonce = (): string => randomBytes(16).toString('base64url');

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
