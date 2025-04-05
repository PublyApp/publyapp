// import { Label } from 'src/components/label';
// import type { NavSectionProps } from 'src/components/nav-section';
// import { SvgColor } from 'src/components/svg-color';

import { Label } from '../components/label/label';
import type { NavSectionProps } from '../components/nav-section/types';
import { SvgColor } from '../components/svg-color/svg-color';

// import { CONFIG } from 'src/global-config';
// import { paths } from 'src/routes/paths';

// ----------------------------------------------------------------------

const icon = (name: string) => {
	// eslint-disable-next-line no-useless-concat
	return <SvgColor src={`/assets/icons/navbar/${name}` + '.svg'} />;
};

const ICONS = {
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
};

// ----------------------------------------------------------------------

export const navData: NavSectionProps['data'] = [
	/**
	 * Overview
	 */
	{
		subheader: 'Overview',
		items: [
			{
				title: 'One',
				path: 'lol',
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
