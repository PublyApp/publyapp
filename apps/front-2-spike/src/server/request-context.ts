import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { getSessionTokensFromCookieHeader } from '~/lib/session-cookie';
import { getSessionTokensFromClient } from '~/lib/session-cookie-client';

import { isServer } from '@org/shared-ts/lib/constants';

export const getCookieHeader = createServerOnlyFn(() =>
	getRequestHeader('cookie'),
);

export const getSessionTokensIsomorphic = async () => {
	if (isServer) {
		const cookieHeader = await getCookieHeader();
		return getSessionTokensFromCookieHeader(cookieHeader);
	}

	return getSessionTokensFromClient();
};
