import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';

import { Label } from '#app/components/label/label.tsx';
import { navSectionCssVars } from '#app/components/nav-section/styles/css-vars.ts';
import type { NavSectionProps } from '#app/components/nav-section/types.ts';
import { NavSectionVerticalItem } from '#app/components/nav-section/vertical/index.ts';
import { NavSectionVertical } from '#app/components/nav-section/vertical/nav-section-vertical.tsx';
import { SvgColor } from '#app/components/svg-color/index.ts';

/**
 * Permissions can be set for each item by using the `allowedRoles` property.
 * - If `allowedRoles` is not set (default), all roles can see the item.
 * - If `allowedRoles` is an empty array `[]`, no one can see the item.
 * - If `allowedRoles` contains specific roles, only those roles can see the item.
 *
 * Examples:
 * - `allowedRoles: ['user']` - only users with the 'user' role can see this item.
 * - `allowedRoles: ['admin']` - only users with the 'admin' role can see this item.
 * - `allowedRoles: ['admin', 'manager']` - only users with the 'admin' or 'manager' roles can see this item.
 *
 * Combine with the `checkPermissions` prop to build conditional expressions.
 * Example usage can be found in: src/sections/_examples/extra/navigation-bar-view/nav-vertical.{jsx | tsx}
 */

export const NAV_SECTION_ITEMS: NavSectionProps['data'] = [
	{
		subheader: 'Marketing',
		items: [
			{
				title: 'Landing',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-dashboard.svg'} />,
				info: <Label color="error">+2 </Label>,
			},
			{
				title: 'Services',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-analytics.svg'} />,
				allowedRoles: ['admin'],
				caption: 'Only admin can see this item.',
			},
			{
				title: 'Blog',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-blog.svg'} />,
				info: <Label color="info">+3 </Label>,
				allowedRoles: ['admin', 'manager'],
				caption: 'Only admin / manager can see this item.',
				children: [
					{
						title: 'Item 1',
						path: '#',
						caption: 'Display caption',
						info: '+2',
					},
					{ title: 'Item 2', path: '#' },
				],
			},
		],
	},
	{
		subheader: 'Travel',
		items: [
			{
				title: 'About',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-user.svg'} />,
				info: '+4',
			},
			{
				title: 'Contact',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-tour.svg'} />,
				disabled: true,
			},
			{
				title: 'Level',
				path: '/components',
				icon: <SvgColor src={'/assets/icons/navbar/ic-menu-item.svg'} />,
				children: [
					{
						title: 'Level 2a',
						path: '/components/extra',
						icon: <SvgColor src={'/assets/icons/navbar/ic-chat.svg'} />,
						caption:
							'Lorem Ipsum is simply dummy text of the printing and typesetting industry.',
						children: [
							{ title: 'Level 3a', path: '#' },
							{
								title: 'Level 3b',
								path: '/components/extra/navigation-bar',
								children: [
									{ title: 'Level 4a', path: '#', disabled: true },
									{
										title: 'Level 4b',
										path: '/components/extra/navigation-bar',
									},
								],
							},
							{ title: 'Level 3c', path: '#' },
						],
					},
					{
						title: 'Level 2b',
						path: '#',
						icon: <SvgColor src={'/assets/icons/navbar/ic-mail.svg'} />,
					},
					{
						title: 'Level 2c',
						path: '#',
						icon: <SvgColor src={'/assets/icons/navbar/ic-calendar.svg'} />,
					},
				],
			},
			{
				title: 'More',
				path: '#',
				icon: <SvgColor src={'/assets/icons/navbar/ic-blank.svg'} />,
			},
		],
	},
];

const config = {
	gap: 4,
	icon: 24,
	radius: 8,
	subItemHeight: 36,
	rootItemHeight: 44,
	currentRole: 'admin',
	hiddenSubheader: false,
	padding: '4px 8px 4px 12px',
};

const StaffProfileSidebar = () => {
	return (
		<Paper
			variant="outlined"
			sx={{
				p: 2,
				width: 1,
				maxWidth: 320,
				borderRadius: 1.5,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<NavSectionVertical
				data={NAV_SECTION_ITEMS}
				checkPermissions={(allowedRoles) =>
					!allowedRoles?.includes(config.currentRole)
				}
				sx={{ flex: '1 1 auto' }}
				cssVars={{ '--nav-item-gap': `${config.gap}px` }}
				slotProps={{
					rootItem: {
						sx: {
							padding: config.padding,
							borderRadius: `${config.radius}px`,
							minHeight: config.rootItemHeight,
						},
						icon: {
							width: config.icon,
							height: config.icon,
							...(!config.icon && { display: 'none' }),
						},
						texts: {},
						title: {},
						caption: {},
						info: {},
						arrow: {},
					},
					subItem: {
						sx: {
							padding: config.padding,
							borderRadius: `${config.radius}px`,
							minHeight: config.subItemHeight,
						},
						icon: {
							width: config.icon,
							height: config.icon,
							...(!config.icon && { display: 'none' }),
						},
						texts: {},
						title: {},
						caption: {},
						info: {},
						arrow: {},
					},
					subheader: { ...(config.hiddenSubheader && { display: 'none' }) },
				}}
			/>

			<Divider sx={{ my: 2 }} />

			<NavSectionVerticalItem
				depth={1}
				path="#"
				title="Chat"
				caption="Praesent porttitor nulla vitae posuere"
				icon={<SvgColor src="/assets/icons/navbar/ic-chat.svg" />}
				sx={(theme) => ({ ...navSectionCssVars.vertical(theme) })}
			/>
		</Paper>
	);
};

export default StaffProfileSidebar;
