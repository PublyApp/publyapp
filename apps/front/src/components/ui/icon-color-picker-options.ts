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

import { TENANT_PROFILE_ICON_NAMES } from '@org/shared-ts/lib/profile-style/tenant-profile-icons';

export type IconColorPickerOption = {
	name: string;
	labelKey: string;
	Icon: Icon;
};

const TENANT_PROFILE_ICON_COMPONENTS: readonly Icon[] = [
	IconShieldCheck,
	IconKey,
	IconLock,
	IconStar,
	IconBriefcase,
	IconAdjustments,
	IconUsersGroup,
	IconSettings,
	IconPencil,
	IconPhoto,
	IconCalendar,
	IconChartBar,
	IconMessage,
	IconMail,
	IconWorld,
	IconBuilding,
];

if (
	TENANT_PROFILE_ICON_NAMES.length !== TENANT_PROFILE_ICON_COMPONENTS.length
) {
	throw new Error(
		'Tenant profile icon catalog and component map are out of sync',
	);
}

export const ICON_COLOR_PICKER_OPTIONS: readonly IconColorPickerOption[] =
	TENANT_PROFILE_ICON_NAMES.map((name, index) => {
		const IconComponent = TENANT_PROFILE_ICON_COMPONENTS[index];
		if (!IconComponent) {
			throw new Error(`Missing tenant profile icon component for ${name}`);
		}

		return {
			name,
			labelKey: `profile-icon-${name}`,
			Icon: IconComponent,
		};
	});

export const DEFAULT_ICON_COLOR_PICKER_OPTION =
	ICON_COLOR_PICKER_OPTIONS[0] as IconColorPickerOption;

export const getIconColorPickerOption = (
	icon?: string,
): IconColorPickerOption | undefined =>
	ICON_COLOR_PICKER_OPTIONS.find((option) => option.name === icon);
