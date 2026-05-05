import {
	defaultSettings,
	SETTINGS_STORAGE_KEY,
} from '#app/components/settings/settings-config.ts';
import type { SettingsState } from '#app/components/settings/types.ts';

export type SettingsSyncSnapshot = {
	state: SettingsState;
	// Monotonic local mutation counter. It is the primary ordering signal for
	// cross-tab writes because storage events can arrive after newer local edits.
	revision: number;
	// Secondary ordering signal for older persisted payloads or equal revisions.
	updatedAt: number;
	// Final deterministic tie-breaker when two tabs write in the same millisecond.
	syncId: string;
};

// Explicit allow-lists turn localStorage into typed app state. Anything outside
// these sets is ignored and replaced by `defaultSettings`.
const colorSchemes = new Set(['light', 'dark']);
const directions = new Set(['ltr', 'rtl']);
const contrasts = new Set(['default', 'hight']);
const navColors = new Set(['integrate', 'apparent']);
const navLayouts = new Set(['vertical', 'horizontal', 'mini']);
const primaryColors = new Set([
	'default',
	'preset1',
	'preset2',
	'preset3',
	'preset4',
	'preset5',
	'preset6',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return Object.prototype.toString.call(value) === '[object Object]';
};

const getNonNegativeInteger = (value: unknown) => {
	if (typeof value !== 'number') {
		return 0;
	}
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return Math.floor(value);
};

const getPositiveFontSize = (value: unknown, fallback: number | undefined) => {
	if (typeof value !== 'number') {
		return fallback;
	}
	if (!Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return value;
};

const getNonEmptyString = (value: unknown, fallback: string | undefined) => {
	if (typeof value !== 'string') {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
};

export const createSettingsSyncId = () => {
	// The ID identifies one write, not one tab. Generating it for every local
	// mutation gives equal-revision/equal-time conflicts a deterministic winner.
	try {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
	} catch {
		// ignore
	}

	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const getEnumValue = <T extends string>(
	values: Set<string>,
	value: unknown,
	fallback: T | undefined,
) => {
	if (typeof value === 'string' && values.has(value)) {
		return value as T;
	}
	return fallback;
};

export const sanitizeSettingsState = (value: unknown): SettingsState => {
	const source = isRecord(value) ? value : {};

	// Always start from defaults so missing or corrupted fields degrade to a
	// complete, safe settings object instead of partial browser-controlled input.
	return {
		...defaultSettings,
		version: getNonEmptyString(source.version, defaultSettings.version),
		fontSize: getPositiveFontSize(source.fontSize, defaultSettings.fontSize),
		fontFamily: getNonEmptyString(
			source.fontFamily,
			defaultSettings.fontFamily,
		),
		compactLayout:
			typeof source.compactLayout === 'boolean'
				? source.compactLayout
				: defaultSettings.compactLayout,
		direction: getEnumValue(
			directions,
			source.direction,
			defaultSettings.direction,
		),
		colorScheme: getEnumValue(
			colorSchemes,
			source.colorScheme,
			defaultSettings.colorScheme,
		),
		contrast: getEnumValue(
			contrasts,
			source.contrast,
			defaultSettings.contrast,
		),
		navColor: getEnumValue(
			navColors,
			source.navColor,
			defaultSettings.navColor,
		),
		navLayout: getEnumValue(
			navLayouts,
			source.navLayout,
			defaultSettings.navLayout,
		),
		primaryColor: getEnumValue(
			primaryColors,
			source.primaryColor,
			defaultSettings.primaryColor,
		),
	};
};

export const getSettingsSnapshotFromPersistedRoot = (
	value: unknown,
): SettingsSyncSnapshot | null => {
	if (!isRecord(value)) {
		return null;
	}

	const settingsSlice = value.settingsSlice;
	if (!isRecord(settingsSlice)) {
		return null;
	}

	// Zustand stores the app state under `{ state, version }`; this extracts only
	// the durable settings slice metadata needed for ordering and application.
	return {
		state: sanitizeSettingsState(settingsSlice.state),
		revision: getNonNegativeInteger(settingsSlice.revision),
		updatedAt: getNonNegativeInteger(settingsSlice.updatedAt),
		syncId: getNonEmptyString(settingsSlice.syncId, '') ?? '',
	};
};

export const getSettingsSnapshotFromPersistedValue = (
	raw: string | null,
): SettingsSyncSnapshot | null => {
	if (!raw) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return null;
		}
		return getSettingsSnapshotFromPersistedRoot(parsed.state);
	} catch {
		return null;
	}
};

export const isIncomingSettingsSnapshotNewer = (
	incoming: SettingsSyncSnapshot,
	current: SettingsSyncSnapshot,
) => {
	// Compare in strict precedence order. This prevents delayed storage events
	// from overwriting newer local edits while still converging simultaneous tabs.
	if (incoming.revision !== current.revision) {
		return incoming.revision > current.revision;
	}

	if (incoming.updatedAt !== current.updatedAt) {
		return incoming.updatedAt > current.updatedAt;
	}

	if (incoming.syncId !== current.syncId) {
		return incoming.syncId > current.syncId;
	}

	return false;
};

export const getPersistedSettingsStorageKey = () => {
	return SETTINGS_STORAGE_KEY;
};
