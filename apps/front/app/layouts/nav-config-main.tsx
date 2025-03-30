// import { '#' from 'src/routes/'#'

// import { CONFIG } from 'src/global-config';

// import { Iconify } from 'src/components/iconify';

import { Iconify } from '../components/iconify/iconify';

import type { NavMainProps } from './main/nav/types';

// ----------------------------------------------------------------------

export const navData: NavMainProps['data'] = [
	{ title: 'Home', path: '/', icon: <Iconify width={22} icon="solar:home-angle-bold-duotone" /> },
	{
		title: 'Components',
		path: '#',
		icon: <Iconify width={22} icon="solar:atom-bold-duotone" />,
	},
	{
		title: 'Pages',
		path: '/pages',
		icon: <Iconify width={22} icon="solar:file-bold-duotone" />,
		children: [
			{
				subheader: 'Other',
				items: [
					{ title: 'About us', path: '#' },
					{ title: 'Contact us', path: '#' },
					{ title: 'FAQs', path: '#' },
					{ title: 'Pricing', path: '#' },
					{ title: 'Payment', path: '#' },
					{ title: 'Maintenance', path: '#' },
					{ title: 'Coming soon', path: '#' },
				],
			},
			{
				subheader: 'Concepts',
				items: [
					{ title: 'Shop', path: '#' },
					{ title: 'Product', path: '#' },
					{ title: 'Checkout', path: '#' },
					{ title: 'Posts', path: '#' },
					{ title: 'Post', path: '#' },
				],
			},
			{
				subheader: 'Auth Demo',
				items: [
					{ title: 'Sign in', path: '#' },
					{ title: 'Sign up', path: '#' },
					{ title: 'Reset password', path: '#' },
					{ title: 'Update password', path: '#' },
					{ title: 'Verify', path: '#' },
					{ title: 'Sign in (centered)', path: '#' },
					{ title: 'Sign up (centered)', path: '#' },
					{ title: 'Reset password (centered)', path: '#' },
					{ title: 'Update password (centered)', path: '#' },
					{ title: 'Verify (centered)', path: '#' },
				],
			},
			{
				subheader: 'Error',
				items: [
					{ title: 'Page 403', path: '#' },
					{ title: 'Page 404', path: '#' },
					{ title: 'Page 500', path: '#' },
				],
			},
			{ subheader: 'Dashboard', items: [{ title: 'Dashboard', path: '#' }] },
		],
	},
	{
		title: 'Docs',
		icon: <Iconify width={22} icon="solar:notebook-bold-duotone" />,
		path: '#',
	},
];
