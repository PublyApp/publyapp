import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '../components/iconify/iconify';
import type { NavSectionProps } from '../components/nav-section/types';
import { SvgColor } from '../components/svg-color/svg-color';

// ----------------------------------------------------------------------

const icon = (name: string) => {
	const iconPath = `/assets/icons/navbar/${name}.svg`;
	return <SvgColor src={iconPath} />;
};

export const ICONS = {
	job: icon('ic-job'),
	mail: icon('ic-mail'),
	user: icon('ic-user'),
	lock: icon('ic-lock'),
	banking: icon('ic-banking'),
	calendar: icon('ic-calendar'),
	dashboard: icon('ic-dashboard'),
	settings: <Iconify icon="solar:settings-bold-duotone" />,
	history: <Iconify icon="solar:history-bold-duotone" />,
	queue: <Iconify icon="solar:layers-bold-duotone" />,
	drafts: <Iconify icon="solar:document-text-bold-duotone" />,
};

// ----------------------------------------------------------------------

export type NavDataType = NavSectionProps['data'];

export const navData: NavDataType = [
	{
		subheader: 'Overview',
		items: [
			{
				title: 'Dashboard',
				path: FRONT_PATH_NAMES.staff.root,
				icon: ICONS.dashboard,
			},
		],
	},
	{
		subheader: 'Management',
		items: [
			{
				title: 'Organizations',
				path: FRONT_PATH_NAMES.staff.tenants.root,
				icon: ICONS.banking,
			},
			{
				title: 'Users',
				path: FRONT_PATH_NAMES.staff.staffUsers.root,
				icon: ICONS.user,
			},
		],
	},
];
