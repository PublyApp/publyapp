import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
	type FediverseProvider,
	useCompleteMastodonConnectMutation,
} from '~/lib/query/mastodon-connect';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

/** What the instance appends when it sends the browser back (RFC 6749). */
export type MastodonCallbackSearch = {
	code?: string;
	state?: string;
	error?: string;
};

const INTEGRATIONS_PATH = '/tenant/settings/integrations';

const mismatchTranslationKey = 'mastodon-reconnect-account-mismatch';

/** A reconnect that came back signed in as another account (#2186): nothing was
 * linked, and the user decides what happens next. */
export type ReconnectMismatch = {
	expectedHandle: string;
	actualHandle: string;
	provider: FediverseProvider;
	instance: string;
};

const readMismatch = (error: unknown): ReconnectMismatch | null => {
	const failure = toApiFailure(error);
	// A 422 normally parses as a validation failure; a problem body whose field errors
	// the parser could not read is still this problem, so match on the key alone.
	if (
		(failure.kind !== 'validation' && failure.kind !== 'problem') ||
		failure.translationKey !== mismatchTranslationKey
	) {
		return null;
	}
	const { expectedHandle, actualHandle, provider, instanceHost } =
		failure.extensions ?? {};
	if (
		typeof expectedHandle !== 'string' ||
		typeof actualHandle !== 'string' ||
		typeof instanceHost !== 'string' ||
		(provider !== 'mastodon' && provider !== 'pixelfed')
	) {
		return null;
	}
	return { expectedHandle, actualHandle, provider, instance: instanceHost };
};

export type MastodonCallbackResult = {
	/** The user declined on the instance. */
	denied: boolean;
	/** Set when a reconnect came back as a different account. */
	mismatch: ReconnectMismatch | null;
	dismissMismatch: () => void;
};

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
 * cleared either way, so a reload never replays the single-use state. Reports
 * a decline, and a reconnect that came back as another account. */
export const useMastodonCallback = (
	tenantId: string | null,
): MastodonCallbackResult => {
	const { code, state, error } = validateMastodonCallbackSearch(
		useSearch({ strict: false }),
	);
	const complete = useCompleteMastodonConnectMutation();
	const navigate = useNavigate();
	const handled = useRef(false);
	const [denied, setDenied] = useState(false);
	const [mismatch, setMismatch] = useState<ReconnectMismatch | null>(null);
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
			// The user declined on the instance: say so instead of clearing silently.
			setDenied(Boolean(error));
			void clear();
			return;
		}
		mutateAsync({ tenantId, code, state })
			.catch((failure: unknown) => setMismatch(readMismatch(failure)))
			.finally(() => void clear());
	}, [tenantId, code, state, error, mutateAsync, navigate]);

	return { denied, mismatch, dismissMismatch: () => setMismatch(null) };
};
