import { create } from 'zustand';
import {
	postBroadcast,
	THEME_SYNC_CHANNEL,
} from '~/lib/tab-sync/broadcast-sync';

export const COLOR_SCHEME_STORAGE_KEY = 'publyapp:color-scheme';
export const SIDEBAR_OPEN_STORAGE_KEY = 'publyapp:sidebar-open';

const DEFAULT_COLOR_SCHEME: ColorScheme = 'light';
const DEFAULT_SIDEBAR_OPEN = true;

export type ColorScheme = 'dark' | 'light';

export type BreadcrumbOverrideItem = {
	label: string;
	to?: string;
};

/**
 * Opaque token identifying the publisher that currently owns the breadcrumb
 * override. Minted internally by `setBreadcrumbOverride` on every publish and
 * captured by the dispose function it returns, so a late cleanup from a page
 * that has already been superseded (its token is no longer the current owner)
 * cannot erase the override a newly mounted page just published.
 */
type BreadcrumbOverrideOwner = symbol;

type UiState = {
	breadcrumbOverride: BreadcrumbOverrideItem[] | null;
	breadcrumbOverrideOwner: BreadcrumbOverrideOwner | null;
	colorScheme: ColorScheme;
	sidebarOpen: boolean;
};

type PersistedColorState = {
	state?: {
		colorScheme?: unknown;
	};
	colorScheme?: unknown;
};

type PersistedColorValue = {
	state?: {
		sidebarOpen?: unknown;
	} | null;
};

const isBrowser = typeof window !== 'undefined';

const DEFAULT_UI_STATE: UiState = {
	breadcrumbOverride: null,
	breadcrumbOverrideOwner: null,
	colorScheme: DEFAULT_COLOR_SCHEME,
	sidebarOpen: DEFAULT_SIDEBAR_OPEN,
};

const readLocalStorageValue = (key: string): string | null => {
	if (!isBrowser) {
		return null;
	}

	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
};

const parseColorScheme = (value: string | null): ColorScheme => {
	if (value === 'dark' || value === 'light') {
		return value;
	}

	return DEFAULT_COLOR_SCHEME;
};

const parsePersistedColorState = (value: string | null): ColorScheme => {
	if (!value) {
		return DEFAULT_COLOR_SCHEME;
	}

	try {
		const parsed = JSON.parse(value) as PersistedColorState;
		const colorScheme =
			typeof parsed.state === 'object' && parsed.state !== null
				? parsed.state.colorScheme
				: parsed.colorScheme;

		return parseColorScheme(
			typeof colorScheme === 'string' ? colorScheme : null,
		);
	} catch {
		return parseColorScheme(value);
	}
};

const parsePersistedSidebarState = (value: string | null): boolean | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		if (typeof parsed === 'boolean') {
			return parsed;
		}
	} catch {
		return null;
	}

	return null;
};

const readLegacySidebarState = (): boolean => {
	if (!isBrowser) {
		return DEFAULT_SIDEBAR_OPEN;
	}

	const rawColorState = readLocalStorageValue(COLOR_SCHEME_STORAGE_KEY);
	if (!rawColorState) {
		return DEFAULT_SIDEBAR_OPEN;
	}

	try {
		const parsed = JSON.parse(rawColorState) as PersistedColorValue;
		const sidebarOpen =
			typeof parsed.state === 'object' && parsed.state !== null
				? parsed.state.sidebarOpen
				: undefined;

		return typeof sidebarOpen === 'boolean'
			? sidebarOpen
			: DEFAULT_SIDEBAR_OPEN;
	} catch {
		return DEFAULT_SIDEBAR_OPEN;
	}
};

const readPersistedSidebarOpen = (): boolean => {
	if (!isBrowser) {
		return DEFAULT_SIDEBAR_OPEN;
	}

	const persistedSidebarOpen = parsePersistedSidebarState(
		readLocalStorageValue(SIDEBAR_OPEN_STORAGE_KEY),
	);

	if (persistedSidebarOpen !== null) {
		return persistedSidebarOpen;
	}

	return readLegacySidebarState();
};

const writeColorScheme = (colorScheme: ColorScheme) => {
	if (!isBrowser) {
		return;
	}

	try {
		window.localStorage.setItem(
			COLOR_SCHEME_STORAGE_KEY,
			JSON.stringify({
				state: {
					colorScheme,
				},
				version: 0,
			}),
		);
	} catch {
		// no-op
	}
};

const writeSidebarOpen = (sidebarOpen: boolean) => {
	if (!isBrowser) {
		return;
	}

	try {
		window.localStorage.setItem(
			SIDEBAR_OPEN_STORAGE_KEY,
			JSON.stringify(sidebarOpen),
		);
	} catch {
		// no-op
	}
};

const applyThemeToDocument = (colorScheme: ColorScheme) => {
	if (!isBrowser) {
		return;
	}

	document.documentElement.classList.remove('dark', 'light');
	if (colorScheme === 'dark') {
		document.documentElement.classList.add('dark');
	}
	document.documentElement.dataset.theme = colorScheme;
};

/**
 * Suppresses the CSS transition on every element for the duration of `apply`
 * (via the `data-theme-changing` attribute the stylesheet keys off) so a
 * color-scheme change never animates — only interactions afterward do. Used
 * both by the local toggle and by a remote tab applying a broadcast theme
 * change.
 */
export const withThemeTransitionSuppressed = (apply: () => void): void => {
	if (!isBrowser) {
		apply();
		return;
	}

	const root = document.documentElement;
	root.setAttribute('data-theme-changing', 'true');
	apply();
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.removeAttribute('data-theme-changing');
		});
	});
};

const readPersistedUiState = (): Pick<
	UiState,
	'colorScheme' | 'sidebarOpen'
> => {
	if (!isBrowser) {
		return DEFAULT_UI_STATE;
	}

	const colorScheme = parsePersistedColorState(
		readLocalStorageValue(COLOR_SCHEME_STORAGE_KEY),
	);
	const sidebarOpen = readPersistedSidebarOpen();

	return {
		colorScheme,
		sidebarOpen,
	};
};

type UiStore = UiState & {
	/**
	 * Publishes a breadcrumb override and returns an owner-scoped dispose
	 * function. Calling dispose clears the override only while this publish is
	 * still the current owner, so a superseded page's late cleanup is a no-op
	 * rather than a stale wipe. Ownership is mandatory and enforced by
	 * construction — there is no tokenless public clear to erase another page's
	 * owned override.
	 */
	setBreadcrumbOverride: (items: BreadcrumbOverrideItem[]) => () => void;
	setColorScheme: (colorScheme: ColorScheme) => void;
	toggleColorScheme: () => void;
	applyRemoteColorScheme: (colorScheme: ColorScheme) => void;
	setSidebarOpen: (sidebarOpen: boolean) => void;
	toggleSidebarOpen: () => void;
	hydrateFromStorage: () => void;
};

export const useUiStore = create<UiStore>((set, get) => ({
	...DEFAULT_UI_STATE,
	setBreadcrumbOverride: (items) => {
		const owner: BreadcrumbOverrideOwner = Symbol('breadcrumb-override');
		set({ breadcrumbOverride: items, breadcrumbOverrideOwner: owner });

		return () =>
			set((state) =>
				// Owner-scoped dispose: only the publish that still owns the override
				// may clear it. This prevents page A's late (post-unmount) cleanup
				// from erasing the override page B just published once B has adopted
				// ownership.
				state.breadcrumbOverrideOwner === owner
					? { breadcrumbOverride: null, breadcrumbOverrideOwner: null }
					: state,
			);
	},
	hydrateFromStorage: () => {
		const { colorScheme, sidebarOpen } = readPersistedUiState();
		applyThemeToDocument(colorScheme);
		set({
			colorScheme,
			sidebarOpen,
		});
	},
	setColorScheme: (colorScheme) => {
		const normalizedColorScheme = parseColorScheme(colorScheme);
		applyThemeToDocument(normalizedColorScheme);
		writeColorScheme(normalizedColorScheme);
		set({ colorScheme: normalizedColorScheme });
		postBroadcast(THEME_SYNC_CHANNEL, { colorScheme: normalizedColorScheme });
	},
	toggleColorScheme: () => {
		const currentColorScheme =
			isBrowser && document.documentElement.classList.contains('dark')
				? 'dark'
				: get().colorScheme;
		const nextColorScheme = currentColorScheme === 'light' ? 'dark' : 'light';
		get().setColorScheme(nextColorScheme);
	},
	applyRemoteColorScheme: (colorScheme) => {
		// Applied from another tab's broadcast: DOM + state only, no
		// re-broadcast (would echo back and forth between tabs) and no
		// re-persist (the origin tab already wrote this value to
		// localStorage — writing it again here would be harmless but
		// redundant).
		const normalizedColorScheme = parseColorScheme(colorScheme);
		applyThemeToDocument(normalizedColorScheme);
		set({ colorScheme: normalizedColorScheme });
	},
	setSidebarOpen: (sidebarOpen) => {
		writeSidebarOpen(sidebarOpen);
		set({ sidebarOpen });
	},
	toggleSidebarOpen: () => {
		get().setSidebarOpen(!get().sidebarOpen);
	},
}));
