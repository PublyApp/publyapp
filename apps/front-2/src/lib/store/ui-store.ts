import { create } from 'zustand';

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

const readInitialUiState = (): UiState => {
	if (!isBrowser) {
		return DEFAULT_UI_STATE;
	}

	return readPersistedUiState();
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
	document.documentElement.classList.add(colorScheme);
	document.documentElement.dataset.theme = colorScheme;
};

const readPersistedUiState = (): UiState => {
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

const bootstrapUiState = readInitialUiState();
applyThemeToDocument(bootstrapUiState.colorScheme);

type UiStore = UiState & {
	setColorScheme: (colorScheme: ColorScheme) => void;
	toggleColorScheme: () => void;
	setSidebarOpen: (sidebarOpen: boolean) => void;
	toggleSidebarOpen: () => void;
	hydrateFromStorage: () => void;
};

export const useUiStore = create<UiStore>((set, get) => ({
	...bootstrapUiState,
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
	},
	toggleColorScheme: () => {
		const currentColorScheme =
			isBrowser && document.documentElement.classList.contains('dark')
				? 'dark'
				: get().colorScheme;
		const nextColorScheme = currentColorScheme === 'light' ? 'dark' : 'light';
		get().setColorScheme(nextColorScheme);
	},
	setSidebarOpen: (sidebarOpen) => {
		writeSidebarOpen(sidebarOpen);
		set({ sidebarOpen });
	},
	toggleSidebarOpen: () => {
		get().setSidebarOpen(!get().sidebarOpen);
	},
}));
