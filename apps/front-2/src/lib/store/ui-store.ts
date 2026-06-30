import { useSyncExternalStore } from 'react';

export const TOOLBAR_THEME_STORAGE_KEY = 'publyapp:color-scheme';
const SIDEBAR_STORAGE_KEY = 'publyapp:sidebar-open';
const DEFAULT_COLOR_SCHEME = 'light';

export type ColorScheme = 'dark' | 'light';

type UiState = {
	colorScheme: ColorScheme;
	sidebarOpen: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
const isBrowser = typeof window !== 'undefined';

const parseColorScheme = (value: string | null): ColorScheme => {
	if (value === 'dark' || value === 'light') {
		return value;
	}

	return DEFAULT_COLOR_SCHEME;
};

const readColorSchemeFromStorage = (): ColorScheme => {
	if (!isBrowser) {
		return DEFAULT_COLOR_SCHEME;
	}

	try {
		return parseColorScheme(window.localStorage.getItem(TOOLBAR_THEME_STORAGE_KEY));
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

let state: UiState = {
	colorScheme: readColorSchemeFromStorage(),
	sidebarOpen: readSidebarStateFromStorage(),
};

applyThemeToDocument(state.colorScheme);

const setState = (next: UiState) => {
	if (next.colorScheme === state.colorScheme && next.sidebarOpen === state.sidebarOpen) {
		return;
	}

	state = next;
	for (const listener of listeners) {
		listener();
	}
};

const persistColorScheme = (colorScheme: ColorScheme) => {
	if (!isBrowser) {
		return;
	}

	try {
		window.localStorage.setItem(TOOLBAR_THEME_STORAGE_KEY, colorScheme);
	} catch {
		// no-op
	}
};

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

export const setColorScheme = (colorScheme: ColorScheme) => {
	applyThemeToDocument(colorScheme);
	persistColorScheme(colorScheme);
	setState({
		...state,
		colorScheme,
	});
};

export const toggleColorScheme = () => {
	const nextColorScheme = state.colorScheme === 'light' ? 'dark' : 'light';
	setColorScheme(nextColorScheme);
};

export const setSidebarOpen = (sidebarOpen: boolean) => {
	persistSidebarState(sidebarOpen);
	setState({
		...state,
		sidebarOpen,
	});
};

export const toggleSidebarOpen = () => {
	setSidebarOpen(!state.sidebarOpen);
};

const subscribe = (listener: Listener) => {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
};

const getSnapshot = (): UiState => state;

export const useUiStore = <T,>(selector: (value: UiState) => T): T => {
	return useSyncExternalStore(
		subscribe,
		() => selector(getSnapshot()),
		() => selector(getSnapshot()),
	);
};

export const hydrateUiStore = () => {
	const nextTheme = readColorSchemeFromStorage();
	const nextSidebarOpen = readSidebarStateFromStorage();

	setState({
		colorScheme: nextTheme,
		sidebarOpen: nextSidebarOpen,
	});
	applyThemeToDocument(nextTheme);
	persistColorScheme(nextTheme);
	persistSidebarState(nextSidebarOpen);
};
