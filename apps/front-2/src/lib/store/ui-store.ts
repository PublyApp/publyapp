import { create } from 'zustand';
import {
	createJSONStorage,
	persist,
	type StateStorage,
} from 'zustand/middleware';

export const COLOR_SCHEME_STORAGE_KEY = 'publyapp:color-scheme';
const DEFAULT_COLOR_SCHEME = 'light';
const DEFAULT_SIDEBAR_OPEN = true;

export type ColorScheme = 'dark' | 'light';

type UiState = {
	colorScheme: ColorScheme;
	sidebarOpen: boolean;
};

type PersistedUiState = {
	state?: {
		colorScheme?: unknown;
		sidebarOpen?: unknown;
	} | null;
	colorScheme?: unknown;
	sidebarOpen?: unknown;
};

const isBrowser = typeof window !== 'undefined';

const DEFAULT_UI_STATE: UiState = {
	colorScheme: DEFAULT_COLOR_SCHEME,
	sidebarOpen: DEFAULT_SIDEBAR_OPEN,
};

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

const parsePersistedUiState = (value: string | null): UiState => {
	if (value === null || value === '') {
		return DEFAULT_UI_STATE;
	}

	try {
		const parsed = JSON.parse(value) as PersistedUiState;
		const source =
			typeof parsed.state === 'object' && parsed.state !== null ? parsed.state : parsed;

		return {
			colorScheme: parseColorScheme(
				typeof source.colorScheme === 'string' ? source.colorScheme : null,
			),
			sidebarOpen: source.sidebarOpen !== false,
		};
	} catch {
		return {
			...DEFAULT_UI_STATE,
			colorScheme: parseColorScheme(value),
		};
	}
};

const parsePersistedState = (value: unknown): UiState => {
	if (typeof value === 'string') {
		return parsePersistedUiState(value);
	}

	if (typeof value !== 'object' || value === null) {
		return DEFAULT_UI_STATE;
	}

	const persisted = value as PersistedUiState;
	if (typeof persisted.state === 'object' && persisted.state !== null) {
		return parsePersistedUiState(
			JSON.stringify({
				colorScheme: persisted.state.colorScheme,
				sidebarOpen: persisted.state.sidebarOpen,
			}),
		);
	}

	return parsePersistedUiState(JSON.stringify(persisted));
};

const applyThemeToDocument = (colorScheme: ColorScheme) => {
	if (!isBrowser) {
		return;
	}

	document.documentElement.classList.remove('dark', 'light');
	document.documentElement.classList.add(colorScheme);
	document.documentElement.dataset.theme = colorScheme;
};

const readInitialUiState = (): UiState => {
	if (!isBrowser) {
		return DEFAULT_UI_STATE;
	}

	try {
		return parsePersistedUiState(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY));
	} catch {
		return DEFAULT_UI_STATE;
	}
};

type UiStore = UiState & {
	setColorScheme: (colorScheme: ColorScheme) => void;
	toggleColorScheme: () => void;
	setSidebarOpen: (sidebarOpen: boolean) => void;
	toggleSidebarOpen: () => void;
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
				set({ sidebarOpen });
			},
			toggleSidebarOpen: () => {
				get().setSidebarOpen(!get().sidebarOpen);
			},
		}),
		{
			name: COLOR_SCHEME_STORAGE_KEY,
			storage: createJSONStorage(() => resolveStorage),
			partialize: (state) => ({
				colorScheme: state.colorScheme,
				sidebarOpen: state.sidebarOpen,
			}),
			merge: (persistedState, currentState) => ({
				...currentState,
				...parsePersistedState(persistedState),
			}),
			onRehydrateStorage: () => (state, error) => {
				if (error || !state) {
					return;
				}

				applyThemeToDocument(state.colorScheme);
			},
		},
	),
);

const initialState = readInitialUiState();
applyThemeToDocument(initialState.colorScheme);
