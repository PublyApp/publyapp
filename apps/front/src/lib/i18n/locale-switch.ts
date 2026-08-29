import { isSupportedLanguage, type SupportedLanguage } from '~/lib/i18n.shared';
import {
	LOCALE_SYNC_CHANNEL,
	postBroadcast,
} from '~/lib/tab-sync/broadcast-sync';

type LocaleSwitchedResult = { locale: SupportedLanguage };

type RouterLike = { invalidate: () => Promise<void> };
type SetLocaleFn = (opts: {
	data: { locale: SupportedLanguage };
}) => Promise<LocaleSwitchedResult>;

/**
 * Re-runs the root loader so it re-resolves `{ locale, resources }` from the
 * (already up to date) locale cookie — RootComponent rebuilds its i18n
 * instance from the fresh loader data, which updates `<html lang>` and every
 * translated string without a full page reload. Shared by the local switch
 * below and by the cross-tab receiver, so both go through one apply path.
 */
export const applyLocale = async (router: RouterLike): Promise<void> => {
	await router.invalidate();
};

/**
 * Full local switch: persist the cookie server-side, tell other tabs, then
 * apply it in this tab. Broadcasting after the cookie write settles mirrors
 * useLogout — other tabs never race the sender to a stale/updated cookie.
 */
export const switchLocale = async (
	locale: SupportedLanguage,
	router: RouterLike,
	setLocaleFn: SetLocaleFn,
): Promise<void> => {
	await setLocaleFn({ data: { locale } });
	postBroadcast(LOCALE_SYNC_CHANNEL, { locale });
	await applyLocale(router);
};

/** Validates a same-origin broadcast payload; any tab can post garbage here. */
export const parseLocaleSyncMessage = (
	data: unknown,
): SupportedLanguage | null => {
	const locale = (data as { locale?: unknown } | null)?.locale;
	if (typeof locale === 'string' && isSupportedLanguage(locale)) {
		return locale;
	}
	return null;
};
