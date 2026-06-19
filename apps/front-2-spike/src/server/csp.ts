import { createServerOnlyFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { nanoid } from 'nanoid';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

type CspRequestOptions = {
	isDevelopment?: boolean;
};

type CspRequestResult = {
	nonce: string;
};

export const createCspForRequest = createServerOnlyFn(
	({
		isDevelopment = process.env.NODE_ENV === 'development',
	}: CspRequestOptions = {}): CspRequestResult => {
		const nonce = nanoid();
		const cspPolicy = createCSPHeader({
			isDevelopment,
			nonce,
		});

		setResponseHeader('Content-Security-Policy', cspPolicy);
		setResponseHeader('Content-Security-Policy-Report-Only', cspPolicy);

		return { nonce };
	},
);
