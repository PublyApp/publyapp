import { createElement, useMemo, type ReactNode } from 'react';

import { BO_PATH_NAMES } from '@devist/shared/lib/constants';

import SvgColor from '@/office/components/SvgColor';

// ----------------------------------------------------------------------
export type NavData = {
	subheader: ReactNode;
	items?: {
		title: ReactNode;
		path: string;
		icon: any; // TODO: change
		children?: {
			title: ReactNode;
			path: string;
		}[];
	}[];
}[];

const icon = (name: string) => {
	// return <SvgColor src={`/assets/icons/navbar/${name}.svg`} sx={{ width: 1, height: 1 }} />;
	return createElement(SvgColor, { src: `/assets/icons/navbar/${name}.svg`, sx: { width: 1, height: 1 } });
	// OR
	// <Iconify icon="fluent:mail-24-filled" />
	// https://icon-sets.iconify.design/solar/
	// https://www.streamlinehq.com/icons
};

// eslint-disable-next-line react-refresh/only-export-components
const ICONS = {
	job: icon('ic_job'),
	blog: icon('ic_blog'),
	chat: icon('ic_chat'),
	mail: icon('ic_mail'),
	user: icon('ic_user'),
	file: icon('ic_file'),
	lock: icon('ic_lock'),
	tour: icon('ic_tour'),
	order: icon('ic_order'),
	label: icon('ic_label'),
	blank: icon('ic_blank'),
	kanban: icon('ic_kanban'),
	folder: icon('ic_folder'),
	banking: icon('ic_banking'),
	booking: icon('ic_booking'),
	invoice: icon('ic_invoice'),
	product: icon('ic_product'),
	calendar: icon('ic_calendar'),
	disabled: icon('ic_disabled'),
	external: icon('ic_external'),
	menuItem: icon('ic_menu_item'),
	ecommerce: icon('ic_ecommerce'),
	analytics: icon('ic_analytics'),
	dashboard: icon('ic_dashboard'),
};

// ----------------------------------------------------------------------

export const useNavData = () => {
	// const { t } = useTranslate();

	const data = useMemo<NavData>(
		() => {
			return [
				// OVERVIEW
				// ----------------------------------------------------------------------
				{
					subheader: 'modules',
					items: [
						{ title: 'dashboard', path: BO_PATH_NAMES.staff.root, icon: ICONS.dashboard },
						{ title: 'tenants', path: BO_PATH_NAMES.staff.tenants.root, icon: ICONS.dashboard },
						// { title: 'file manager', path: BO_PATH_NAMES.dashboard.fileManager.root, icon: ICONS.dashboard },
						// { title: 'two', path: paths.dashboard.two, icon: ICONS.ecommerce },
						// {
						// 	title: 'three',
						// 	path: paths.dashboard.three,
						// 	icon: ICONS.analytics,
						// },
					],
				},

				// MANAGEMENT
				// ----------------------------------------------------------------------
				// {
				// 	subheader: 'directory',
				// 	items: [
				// 		// {
				// 		// 	title: 'user',
				// 		// 	path: paths.dashboard.group.root,
				// 		// 	icon: ICONS.user,
				// 		// 	children: [
				// 		// 		{ title: 'four', path: paths.dashboard.group.root },
				// 		// 		{ title: 'five', path: paths.dashboard.group.five },
				// 		// 		{ title: 'six', path: paths.dashboard.group.six },
				// 		// 	],
				// 		// },
				// 		// {
				// 		// 	title: 'Web hosts',
				// 		// 	path: BO_PATH_NAMES.dashboard.root,
				// 		// 	icon: ICONS.dashboard,
				// 		// },
				// 		{
				// 			// title: `${t('post')}s`,
				// 			title: 'Blog',
				// 			path: BO_PATH_NAMES.staff.posts.root,
				// 			icon: ICONS.blog,
				// 			children: [
				// 				{
				// 					// title: t('list'),
				// 					title: `${t('post')}s`,
				// 					path: BO_PATH_NAMES.staff.posts.root,
				// 				},
				// 				{
				// 					title: t('new'),
				// 					path: BO_PATH_NAMES.staff.posts.create,
				// 				},
				// 				{
				// 					title: t('settings'),
				// 					path: BO_PATH_NAMES.staff.posts.settings,
				// 				},
				// 			],
				// 		},
				// 		{
				// 			title: 'file manager (todo)',
				// 			icon: ICONS.file,
				// 			path: '#',
				// 		},
				// 		{
				// 			title: 'Social media scheduler (todo)',
				// 			icon: ICONS.calendar,
				// 			path: '#',
				// 		},
				// 		{
				// 			title: 'Facebook messenger bot (todo)',
				// 			icon: ICONS.chat,
				// 			path: '#',
				// 		},
				// 		// {
				// 		// 	title: 'New Post',
				// 		// 	path: BO_PATH_NAMES.dashboard.posts.create,
				// 		// 	icon: ICONS.dashboard,
				// 		// },
				// 	],
				// },
			];
		},
		[
			/* t */
		],
	);

	return data;
};
