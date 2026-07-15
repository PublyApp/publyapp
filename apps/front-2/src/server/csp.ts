import { randomBytes } from 'node:crypto';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

import { getOptionalPublicApiBaseUrl } from '../lib/env';

const getPublicApiOrigin = (): string | undefined => {
	const publicApiBaseUrl = getOptionalPublicApiBaseUrl();

	if (!publicApiBaseUrl) {
		return undefined;
	}

	try {
		const origin = new URL(publicApiBaseUrl).origin;
		return origin === 'null' ? undefined : origin;
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
