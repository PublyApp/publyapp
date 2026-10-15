import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useCompleteMastodonConnectMutation } from '~/lib/query/mastodon-connect';

/** What the instance appends when it sends the browser back (RFC 6749). */
export type MastodonCallbackSearch = {
	code?: string;
	state?: string;
	error?: string;
};

const INTEGRATIONS_PATH = '/tenant/settings/integrations';

/** What the integrations route keeps from its query string (RFC 6749 names). */
export const validateMastodonCallbackSearch = (
	search: Record<string, unknown>,
): MastodonCallbackSearch => ({
	code: typeof search['code'] === 'string' ? search['code'] : undefined,
	state: typeof search['state'] === 'string' ? search['state'] : undefined,
	error: typeof search['error'] === 'string' ? search['error'] : undefined,
});

/** Finishes a Mastodon connect once: the instance redirected back with `code`
 * and `state` (or an `error` when the user declined). The query string is
 * cleared either way, so a reload never replays the single-use state. */
export const useMastodonCallback = (tenantId: string | null): void => {
	const { code, state, error } = validateMastodonCallbackSearch(
		useSearch({ strict: false }),
	);
	const complete = useCompleteMastodonConnectMutation();
	const navigate = useNavigate();
	const handled = useRef(false);
	const { mutateAsync } = complete;

	useEffect(() => {
		const hasCallback = Boolean(code) || Boolean(error);
		if (tenantId === null || handled.current || !hasCallback) {
			return;
		}
		handled.current = true;

		const clear = () =>
			navigate({ to: INTEGRATIONS_PATH, search: {}, replace: true });
		if (!code || !state) {
			void clear();
			return;
		}
		mutateAsync({ tenantId, code, state })
			.catch(() => undefined)
			.finally(() => void clear());
	}, [tenantId, code, state, error, mutateAsync, navigate]);
};
