/* eslint-disable react/button-has-type */
import React from 'react';

import { RiArrowDownSFill } from '@remixicon/react';
import { BookText, House, PackageSearch } from 'lucide-react';

import { Logo } from '../../Logo';
import { Divider } from '../../tremor/Divider';
import { Input } from '../../tremor/Input';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarLink,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarSubLink,
} from '../../tremor/Sidebar';
import { cx, focusRing } from '../../tremor/tremor.utils';

import { UserProfile } from './UserProfile';

const navigation = [
	{
		name: 'Home',
		href: '#',
		icon: House,
		notifications: false,
		active: false,
	},
	{
		name: 'Inbox',
		href: '#',
		icon: PackageSearch,
		notifications: 2,
		active: false,
	},
] as const;

const navigation2 = [
	{
		name: 'Sales',
		href: '#',
		icon: BookText,
		children: [
			{
				name: 'Quotes',
				href: '#',
				active: true,
			},
			{
				name: 'Orders',
				href: '#',
				active: false,
			},
			{
				name: 'Insights & Reports',
				href: '#',
				active: false,
			},
		],
	},
	{
		name: 'Products',
		href: '#',
		icon: PackageSearch,
		children: [
			{
				name: 'Items',
				href: '#',
				active: false,
			},
			{
				name: 'Variants',
				href: '#',
				active: false,
			},
			{
				name: 'Suppliers',
				href: '#',
				active: false,
			},
		],
	},
] as const;

export const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => {
	const [openMenus, setOpenMenus] = React.useState<string[]>([navigation2[0].name, navigation2[1].name]);

	const toggleMenu = (name: string) => {
		setOpenMenus((prev: string[]) => {
			return prev.includes(name)
				? prev.filter((item: string) => {
						return item !== name;
					})
				: [...prev, name];
		});
	};

	return (
		<Sidebar {...props} className="bg-gray-50 dark:bg-gray-925">
			<SidebarHeader className="px-3 py-4">
				<div className="flex items-center gap-3">
					<span className="flex size-9 items-center justify-center rounded-md bg-white p-1.5 shadow-xs ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
						<Logo className="size-6 text-blue-500 dark:text-blue-500" />
					</span>
					<div>
						<span className="block text-sm font-semibold text-gray-900 dark:text-gray-50">Innovex Systems</span>
						<span className="block text-xs text-gray-900 dark:text-gray-50">Premium Starter Plan</span>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<Input type="search" placeholder="Search items..." className="sm:[&>input]:py-1.5" />
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup className="pt-0">
					<SidebarGroupContent>
						<SidebarMenu className="space-y-1">
							{navigation.map((item) => {
								return (
									<SidebarMenuItem key={item.name}>
										<SidebarLink href="#" isActive={item.active} icon={item.icon} notifications={item.notifications}>
											{item.name}
										</SidebarLink>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<div className="px-3">
					<Divider className="my-0 py-0" />
				</div>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu className="space-y-4">
							{navigation2.map((item) => {
								return (
									<SidebarMenuItem key={item.name}>
										{/* @CHRIS/SEV: discussion whether to componentize (-> state mgmt) */}
										<button
											onClick={() => {
												return toggleMenu(item.name);
											}}
											className={cx(
												'flex w-full items-center justify-between gap-x-2.5 rounded-md p-2 text-base text-gray-900 transition hover:bg-gray-200/50 sm:text-sm dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50',
												focusRing,
											)}
										>
											<div className="flex items-center gap-2.5">
												<item.icon className="size-[18px] shrink-0" aria-hidden="true" />
												{item.name}
											</div>
											<RiArrowDownSFill
												className={cx(
													openMenus.includes(item.name) ? 'rotate-0' : '-rotate-90',
													'size-5 shrink-0 transform text-gray-400 transition-transform duration-150 ease-in-out dark:text-gray-600',
												)}
												aria-hidden="true"
											/>
										</button>
										{item.children && openMenus.includes(item.name) && (
											<SidebarMenuSub>
												<div className="absolute inset-y-0 left-4 w-px bg-gray-300 dark:bg-gray-800" />
												{item.children.map((child) => {
													return (
														<SidebarMenuItem key={child.name}>
															<SidebarSubLink href={child.href} isActive={child.active}>
																{child.name}
															</SidebarSubLink>
														</SidebarMenuItem>
													);
												})}
											</SidebarMenuSub>
										)}
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<div className="border-t border-gray-200 dark:border-gray-800" />
				<UserProfile />
			</SidebarFooter>
		</Sidebar>
	);
};
