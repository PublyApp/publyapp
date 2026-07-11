import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { applyLocale, parseLocaleSyncMessage } from '~/lib/locale-switch';
import type { ColorScheme } from '~/lib/store/ui-store';
import {
	useUiStore,
	withThemeTransitionSuppressed,
} from '~/lib/store/ui-store';

import {
	AUTH_SYNC_CHANNEL,
	LOCALE_SYNC_CHANNEL,
	THEME_SYNC_CHANNEL,
	useBroadcastSync,
} from './broadcast-sync';

type AuthSyncMessage = { type: 'logout' | 'login' };
type ThemeSyncMessage = { colorScheme: ColorScheme };

const isAuthSyncMessage = (data: unknown): data is AuthSyncMessage => {
	const type = (data as { type?: unknown } | null)?.type;
	return type === 'logout' || type === 'login';
};

const isThemeSyncMessage = (data: unknown): data is ThemeSyncMessage => {
	const colorScheme = (data as { colorScheme?: unknown } | null)?.colorScheme;
	return colorScheme === 'light' || colorScheme === 'dark';
};

const isAuthedSurface = (pathname: string): boolean =>
	pathname.startsWith('/staff') || pathname.startsWith('/tenant');

const isAuthPageSurface = (pathname: string): boolean => pathname === '/login';

/**
 * Mounted once in __root.tsx so it is active on every surface, including the
 * (unauthenticated) /login route.
 *
 * Security note: BroadcastChannel is same-origin only, but any tab on this
 * origin — not just ones this app opened — can post to these channels. The
 * worst case must therefore never be worse than a soft navigation or a
 * refetch: this listener never clears cookies or otherwise mutates the
 * session itself. A spurious `logout` bounces an authed tab to /login (which,
 * if the tab is actually still authenticated, immediately redirects it back
 * via the auth-page guard). A spurious `login` only re-runs that guard or
 * invalidates queries.
 */
export const TabSyncListener = () => {
	const pathname = useLocation({ select: (location) => location.pathname });
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const applyRemoteColorScheme = useUiStore(
		(state) => state.applyRemoteColorScheme,
	);

	useBroadcastSync<unknown>(AUTH_SYNC_CHANNEL, (data) => {
		if (!isAuthSyncMessage(data)) {
			return;
		}

		if (data.type === 'logout') {
			// Marketing/auth-surface tabs have nothing to log out of — ignore.
			if (!isAuthedSurface(pathname)) {
				return;
			}
			queryClient.clear();
			void navigate({ to: '/login', replace: true });
			return;
		}

		// data.type === 'login'
		if (isAuthPageSurface(pathname)) {
			// Don't duplicate the guard's redirect logic here — just re-run it.
			void router.invalidate();
			return;
		}

		if (isAuthedSurface(pathname)) {
			void queryClient.invalidateQueries();
		}
		// Marketing tabs ignore login broadcasts.
	});

	useBroadcastSync<unknown>(THEME_SYNC_CHANNEL, (data) => {
		if (!isThemeSyncMessage(data)) {
			return;
		}
		withThemeTransitionSuppressed(() => {
			applyRemoteColorScheme(data.colorScheme);
		});
	});

	useBroadcastSync<unknown>(LOCALE_SYNC_CHANNEL, (data) => {
		const locale = parseLocaleSyncMessage(data);
		if (!locale || locale === document.documentElement.lang) {
			return;
		}
		// The cookie is host-shared and was already written by the sender —
		// this tab only needs to re-run the root loader, never rewrite it.
		void applyLocale(router);
	});

	return null;
};
