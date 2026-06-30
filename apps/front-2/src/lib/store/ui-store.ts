import { create } from 'zustand';
import {
	createJSONStorage,
	persist,
	type StateStorage,
} from 'zustand/middleware';

export const COLOR_SCHEME_STORAGE_KEY = 'publyapp:color-scheme';
const SIDEBAR_STORAGE_KEY = 'publyapp:sidebar-open';
const DEFAULT_COLOR_SCHEME = 'light';

export type ColorScheme = 'dark' | 'light';

type UiState = {
	colorScheme: ColorScheme;
	sidebarOpen: boolean;
};

const isBrowser = typeof window !== 'undefined';

const resolveStorage: StateStorage = {
	getItem: (name) => {
		if (!isBrowser) {
			return null;
		}

		try {
			return window.localStorage.getItem(name);
		} catch {
			return null;
		}
	},
	setItem: (name, value) => {
		if (!isBrowser) {
			return;
		}

		try {
			window.localStorage.setItem(name, value);
		} catch {
			// no-op
		}
	},
	removeItem: (name) => {
		if (!isBrowser) {
			return;
		}

		try {
			window.localStorage.removeItem(name);
		} catch {
			// no-op
		}
	},
};

const parseColorScheme = (value: string | null): ColorScheme => {
	if (value === 'dark' || value === 'light') {
		return value;
	}

	return DEFAULT_COLOR_SCHEME;
};

const parsePersistedTheme = (value: string | null): ColorScheme => {
	if (value === null) {
		return DEFAULT_COLOR_SCHEME;
	}

	try {
		const parsed = JSON.parse(value) as { state?: { colorScheme?: unknown } } & {
			colorScheme?: unknown;
		};

		return parseColorScheme(
			((parsed?.state?.colorScheme ?? parsed?.colorScheme) as string | null) ??
				null,
		);
	} catch {
		return parseColorScheme(value);
	}
};

const readColorSchemeFromStorage = (): ColorScheme => {
	if (!isBrowser) {
		return DEFAULT_COLOR_SCHEME;
	}

	try {
		return parsePersistedTheme(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY));
	} catch {
		return DEFAULT_COLOR_SCHEME;
	}
};

const readSidebarStateFromStorage = (): boolean => {
	if (!isBrowser) {
		return true;
	}

	try {
		return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
	} catch {
		return true;
	}
};

const applyThemeToDocument = (colorScheme: ColorScheme) => {
	if (!isBrowser) {
		return;
	}

	document.documentElement.classList.remove('dark', 'light');
	document.documentElement.classList.add(colorScheme);
	document.documentElement.dataset.theme = colorScheme;
};

const readInitialUiState = (): UiState => ({
	colorScheme: readColorSchemeFromStorage(),
	sidebarOpen: readSidebarStateFromStorage(),
});

const persistSidebarState = (sidebarOpen: boolean) => {
	if (!isBrowser) {
		return;
	}

	try {
		window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarOpen ? 'true' : 'false');
	} catch {
		// no-op
	}
};

type UiStore = UiState & {
	setColorScheme: (colorScheme: ColorScheme) => void;
	toggleColorScheme: () => void;
	setSidebarOpen: (sidebarOpen: boolean) => void;
	toggleSidebarOpen: () => void;
	hydrate: () => void;
};

export const useUiStore = create<UiStore>()(
	persist(
		(set, get) => ({
			...readInitialUiState(),
			setColorScheme: (colorScheme) => {
				const normalizedColorScheme = parseColorScheme(colorScheme);
				applyThemeToDocument(normalizedColorScheme);
				set({ colorScheme: normalizedColorScheme });
			},
			toggleColorScheme: () => {
				const nextColorScheme =
					get().colorScheme === 'light' ? 'dark' : 'light';
				get().setColorScheme(nextColorScheme);
			},
			setSidebarOpen: (sidebarOpen) => {
				persistSidebarState(sidebarOpen);
				set({ sidebarOpen });
			},
			toggleSidebarOpen: () => {
				get().setSidebarOpen(!get().sidebarOpen);
			},
			hydrate: () => {
				const nextTheme = readColorSchemeFromStorage();
				const nextSidebarOpen = readSidebarStateFromStorage();
				get().setColorScheme(nextTheme);
				set({ sidebarOpen: nextSidebarOpen });
			},
		}),
		{
			name: COLOR_SCHEME_STORAGE_KEY,
			storage: createJSONStorage(() => resolveStorage),
			partialize: (state) => ({ colorScheme: state.colorScheme }),
			merge: (persistedState, currentState) => {
				const persisted = (persistedState as { state?: { colorScheme?: unknown } }) ?? {};
				return {
					...currentState,
					colorScheme: parseColorScheme(
						(persisted.state?.colorScheme as string) ?? null,
					),
				};
			},
		},
	),
);

const initialState = readInitialUiState();
applyThemeToDocument(initialState.colorScheme);

export const setColorScheme = (colorScheme: ColorScheme) => {
	useUiStore.getState().setColorScheme(colorScheme);
};

export const toggleColorScheme = () => {
	useUiStore.getState().toggleColorScheme();
};

export const setSidebarOpen = (sidebarOpen: boolean) => {
	useUiStore.getState().setSidebarOpen(sidebarOpen);
};

export const toggleSidebarOpen = () => {
	useUiStore.getState().toggleSidebarOpen();
};

export const hydrateUiStore = () => {
	useUiStore.getState().hydrate();
};
