import {
	DEFAULT_ICON_COLOR_PICKER_OPTION,
	getIconColorPickerOption,
} from '~/components/ui/icon-color-picker-options';

const PROFILE_CARD_ICON_NAMES = [
	'shield-check',
	'key',
	'lock',
	'star',
	'briefcase',
	'adjustments',
	'users-group',
	'settings',
] as const;
const PROFILE_CARD_TONE_COUNT = 8;

export type ProfileCardStyle = {
	Icon: (typeof DEFAULT_ICON_COLOR_PICKER_OPTION)['Icon'];
	icon: string;
	tone: string;
};

/** Returns a picker-valid, deterministic icon and tone unless valid persisted
 * values override them (#980). Shared by the tenant and staff profile
 * surfaces so both scopes fall back identically. */
const deriveProfileCardStyle = (
	name: string,
	icon?: string | null,
	tone?: string | null,
): ProfileCardStyle => {
	let sum = 0;
	for (const char of name) {
		sum += char.codePointAt(0) ?? 0;
	}

	const derivedIconName =
		PROFILE_CARD_ICON_NAMES[sum % PROFILE_CARD_ICON_NAMES.length] ??
		DEFAULT_ICON_COLOR_PICKER_OPTION.name;
	const iconOption =
		getIconColorPickerOption(icon ?? undefined) ??
		getIconColorPickerOption(derivedIconName) ??
		DEFAULT_ICON_COLOR_PICKER_OPTION;
	const derivedTone = String(sum % PROFILE_CARD_TONE_COUNT);
	const toneNumber = Number(tone);
	const persistedTone =
		tone !== null &&
		tone !== undefined &&
		Number.isInteger(toneNumber) &&
		toneNumber >= 0 &&
		toneNumber < PROFILE_CARD_TONE_COUNT &&
		String(toneNumber) === tone
			? tone
			: undefined;

	return {
		Icon: iconOption.Icon,
		icon: iconOption.name,
		tone: persistedTone ?? derivedTone,
	};
};

export { deriveProfileCardStyle };
