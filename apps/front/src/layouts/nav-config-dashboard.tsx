import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import { Iconify } from '../components/iconify/iconify';
import { Label } from '../components/label/label';
import type { NavSectionProps } from '../components/nav-section/types';
import { SvgColor } from '../components/svg-color/svg-color';

// ----------------------------------------------------------------------

const icon = (name: string) => {
	const iconPath = `/assets/icons/navbar/${name}.svg`;
	return <SvgColor src={iconPath} />;
};

export const ICONS = {
	job: icon('ic-job'),
	blog: icon('ic-blog'),
	chat: icon('ic-chat'),
	mail: icon('ic-mail'),
	user: icon('ic-user'),
	file: icon('ic-file'),
	lock: icon('ic-lock'),
	tour: icon('ic-tour'),
	order: icon('ic-order'),
	label: icon('ic-label'),
	blank: icon('ic-blank'),
	kanban: icon('ic-kanban'),
	folder: icon('ic-folder'),
	course: icon('ic-course'),
	banking: icon('ic-banking'),
	booking: icon('ic-booking'),
	invoice: icon('ic-invoice'),
	product: icon('ic-product'),
	calendar: icon('ic-calendar'),
	disabled: icon('ic-disabled'),
	external: icon('ic-external'),
	menuItem: icon('ic-menu-item'),
	ecommerce: icon('ic-ecommerce'),
	analytics: icon('ic-analytics'),
	dashboard: icon('ic-dashboard'),
	parameter: icon('ic-parameter'),
	settings: <Iconify icon="solar:settings-bold-duotone" />,
	history: <Iconify icon="solar:history-bold-duotone" />,
	queue: <Iconify icon="solar:layers-bold-duotone" />,
	drafts: <Iconify icon="solar:document-text-bold-duotone" />,
};

// ----------------------------------------------------------------------

export type NavDataType = NavSectionProps['data'];

export const navData: NavDataType = [
	/**
	 * Overview
	 */
	{
		subheader: 'Overview',
		items: [
			{
				title: 'One',
				path: FRONT_PATH_NAMES.staff.root,
				icon: ICONS.dashboard,
				info: <Label>v0</Label>,
			},
			{ title: 'Two', path: 'bob', icon: ICONS.ecommerce },
			{ title: 'Three', path: 'fof', icon: ICONS.analytics },
		],
	},
	/**
	 * Management
	 */
	{
		subheader: 'Management',
		items: [
			{
				title: 'Group',
				path: '#',
				icon: ICONS.user,
				children: [
					{ title: 'Four', path: '#' },
					{ title: 'Five', path: '#' },
					{ title: 'Six', path: '#' },
				],
			},
		],
	},
];
