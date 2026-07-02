import { randomBytes } from 'node:crypto';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

const getPublicApiOrigin = (): string | undefined => {
	const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;

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

const appendConnectSrcOrigin = (
	policy: string,
	origin: string | undefined,
): string => {
	if (!origin) {
		return policy;
	}

	const directives = policy
		.split(';')
		.map((directive) => directive.trim())
		.filter(Boolean);

	for (let index = 0; index < directives.length; index += 1) {
		const parts = directives[index].split(/\s+/);

		if (parts[0] !== 'connect-src') {
			continue;
		}

		if (!parts.includes(origin)) {
			directives[index] = `${directives[index]} ${origin}`;
		}

		return directives.join('; ');
	}

	return [...directives, `connect-src 'self' ${origin}`].join('; ');
};

export const mintCspNonce = (): string => randomBytes(16).toString('base64url');

export const applyCspHeaders = (
	headers: Headers,
	nonce: string,
	isDevelopment: boolean,
): void => {
	const cspPolicy = appendConnectSrcOrigin(
		createCSPHeader({ isDevelopment, nonce }),
		getPublicApiOrigin(),
	);

	headers.set('Content-Security-Policy', cspPolicy);
	headers.set('Content-Security-Policy-Report-Only', cspPolicy);
};
