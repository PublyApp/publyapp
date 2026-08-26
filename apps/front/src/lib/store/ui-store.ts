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

type UiState = {
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

/**
 * The client's INITIAL store state reads localStorage at module load, not in
 * a post-commit effect (#936): a persisted preference must hold from the very
 * first client render. The blocking head script already applies the theme to
 * `<html>` before first paint, but the store used to wake up on hardcoded
 * defaults and correct itself inside `ThemeHydrationListener`'s effect — so
 * the real shell rendered the default panel state for one window and then
 * flipped to the persisted value (the rotating shell.spec.ts flake class:
 * collapse clicks landing on default-state markup, open/collapsed misreads
 * across navigations). On the server this initializer never runs and the
 * defaults hold, matching the neutral SSR geometry.
 */
const INITIAL_UI_STATE: UiState = readPersistedUiState();

type UiStore = UiState & {
	setColorScheme: (colorScheme: ColorScheme) => void;
	toggleColorScheme: () => void;
	applyRemoteColorScheme: (colorScheme: ColorScheme) => void;
	setSidebarOpen: (sidebarOpen: boolean) => void;
	toggleSidebarOpen: () => void;
	hydrateFromStorage: () => void;
};

export const useUiStore = create<UiStore>((set, get) => ({
	...INITIAL_UI_STATE,
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
