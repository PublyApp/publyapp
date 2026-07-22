import {
	IconAdjustments,
	IconBriefcase,
	IconBuilding,
	IconCalendar,
	IconChartBar,
	IconKey,
	IconLock,
	IconMail,
	IconMessage,
	IconPencil,
	IconPhoto,
	IconSettings,
	IconShieldCheck,
	IconStar,
	IconUsersGroup,
	IconWorld,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';

export type IconColorPickerOption = {
	name: string;
	labelKey: string;
	Icon: Icon;
};

export const ICON_COLOR_PICKER_OPTIONS: readonly IconColorPickerOption[] = [
	{
		name: 'shield-check',
		labelKey: 'profile-icon-shield-check',
		Icon: IconShieldCheck,
	},
	{ name: 'key', labelKey: 'profile-icon-key', Icon: IconKey },
	{ name: 'lock', labelKey: 'profile-icon-lock', Icon: IconLock },
	{ name: 'star', labelKey: 'profile-icon-star', Icon: IconStar },
	{
		name: 'briefcase',
		labelKey: 'profile-icon-briefcase',
		Icon: IconBriefcase,
	},
	{
		name: 'adjustments',
		labelKey: 'profile-icon-adjustments',
		Icon: IconAdjustments,
	},
	{
		name: 'users-group',
		labelKey: 'profile-icon-users-group',
		Icon: IconUsersGroup,
	},
	{
		name: 'settings',
		labelKey: 'profile-icon-settings',
		Icon: IconSettings,
	},
	{ name: 'pencil', labelKey: 'profile-icon-pencil', Icon: IconPencil },
	{ name: 'photo', labelKey: 'profile-icon-photo', Icon: IconPhoto },
	{
		name: 'calendar',
		labelKey: 'profile-icon-calendar',
		Icon: IconCalendar,
	},
	{
		name: 'chart-bar',
		labelKey: 'profile-icon-chart-bar',
		Icon: IconChartBar,
	},
	{
		name: 'message',
		labelKey: 'profile-icon-message',
		Icon: IconMessage,
	},
	{ name: 'mail', labelKey: 'profile-icon-mail', Icon: IconMail },
	{ name: 'world', labelKey: 'profile-icon-world', Icon: IconWorld },
	{
		name: 'building',
		labelKey: 'profile-icon-building',
		Icon: IconBuilding,
	},
];

export const DEFAULT_ICON_COLOR_PICKER_OPTION =
	ICON_COLOR_PICKER_OPTIONS[0] as IconColorPickerOption;

export const getIconColorPickerOption = (
	icon?: string,
): IconColorPickerOption | undefined =>
	ICON_COLOR_PICKER_OPTIONS.find((option) => option.name === icon);

export const getIconColorPickerIcon = (icon?: string): Icon | undefined =>
	getIconColorPickerOption(icon)?.Icon;
