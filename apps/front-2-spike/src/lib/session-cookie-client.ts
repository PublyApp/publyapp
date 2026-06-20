import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import { parseSessionCookie, type ParsedSessionTokens } from './session-cookie';

// Browser-only session-cookie reader (Finding B2).
//
// Reads `document.cookie` directly — matches the current shipped app's
// `getSessionTokensFromClient()`. The session cookie is JS-readable (NOT httpOnly), so
// the browser Kiota client can read its token here.
//
// ⚠️ This module touches `document` and MUST NEVER be imported by a server module
// (only the browser queryFn imports it — see lib/query.ts in Task 2.4).
export const getSessionTokensFromClient = (): ParsedSessionTokens => {
	const raw = document.cookie
		.split('; ')
		.find((c) => c.startsWith(`${SESSION_TOKEN_COOKIE_KEY}=`))
		?.split('=')[1];
	return raw
		? parseSessionCookie(decodeURIComponent(raw))
		: { staffToken: undefined, tenantToken: undefined };
};
