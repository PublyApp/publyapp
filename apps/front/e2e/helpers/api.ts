import type { Page } from '@playwright/test';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import {
	parseSessionCookie,
	selectToken,
} from '@org/shared-ts/lib/session/parse';

import { API_URL } from './compose-env';

/** Shared across every e2e spec that mocks/asserts against the real API
 * origin — previously copy-pasted as a local const in 14 spec files
 * (review-r1-tests.md F29). `E2E_API_BASE_URL` lets a private docker-compose
 * instance (remapped host ports) retarget every spec's mock matcher at once;
 * the default is the shared-stack URL. */
export const API_BASE_URL =
	process.env.E2E_API_BASE_URL ?? API_URL;

/**
 * The session token to put in `X-Session-Token` when a spec calls the API
 * directly (bypassing the app's client), e.g. to prove a server-side guard
 * holds even when the front-end clamp is bypassed.
 *
 * Why this is not just "read the cookie": the API authenticates off the
 * `X-Session-Token` HEADER, not the cookie, and the cookie does not hold a
 * bare token — it holds a SCOPED value (`s:<staff>`, `t:<tenant>`, or a
 * `+`-joined pair, url-encoded). Sending the raw cookie value as the header
 * yields a 401 that looks exactly like a failing assertion about whatever the
 * spec was really testing. So decode it with the product's own parser
 * (`parseSessionCookie`/`selectToken`) rather than re-implementing the format
 * here — if the cookie format changes, this helper follows it for free.
 */
export const getSessionTokenFromBrowser = async (
	page: Page,
	scope: 'staff' | 'tenant' = 'staff',
): Promise<string | undefined> => {
	const cookies = await page.context().cookies();
	const rawCookieValue = cookies.find(
		(cookie) => cookie.name === SESSION_TOKEN_COOKIE_KEY,
	)?.value;

	if (!rawCookieValue) {
		return undefined;
	}

	// Playwright hands back the RAW cookie value, still percent-encoded
	// (`s%3A<token>`). In the app that decoding is done for us by `cookie.parse()`
	// before `parseSessionCookie` ever sees the value, so decode here too —
	// otherwise the `s:` scope prefix is never recognised, every token parses as
	// an unscoped tenant token, and the staff lookup silently returns undefined.
	return selectToken(
		parseSessionCookie(decodeURIComponent(rawCookieValue)),
		scope,
	);
};
