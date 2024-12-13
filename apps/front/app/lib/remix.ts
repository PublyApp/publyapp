import { verify } from 'crypto';

import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';
import type { LoaderFunctionArgs } from 'react-router';

import { sleep } from '@/shared/utils/any.utils';

import { initApiClientOnServer } from './api';
import { env } from './env';

export const getServerLoader = ({ loader: innerLoader }: { loader: (args: any) => Promise<unknown> }) => {
	const loader = async (args: LoaderFunctionArgs) => {
		// if auth is needed
		// check if session token cookie is present
		const cookies = args.request.headers.getSetCookie();
		const sessionTokenCookie = cookies.find((cookie) => {
			return cookie.startsWith('session_token=');
		});

		let sessionToken: string | undefined;

		if (sessionTokenCookie) {
			[, sessionToken] = sessionTokenCookie.split('=');
		}

		if (!sessionToken) {
			// throw new Error('Unauthorized');
		}

		// const apiClient = initApiClientOnServer({ locale: 'en', sessionToken });

		const veriFyTokenPromise = /* apiClient.auth.verifyToken() */ sleep(100, false);

		// do not await but handle the promise in its own thread
		veriFyTokenPromise.then(async (isTokenValid) => {
			if (!isTokenValid) {
				throw new Error('Unauthorized');
			}
			// verify authorizations: todo later
		});

		return innerLoader({ ...args, veriFyTokenPromise });
	};

	return loader;
};
