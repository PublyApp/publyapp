import type React from 'react';
import { type ComponentType } from 'react';

// import { Drawer } from '@mantine/core';

import { useNavData } from '@/front/hooks/useNavData';

import '@/front/lib/zustand/features/settings.slice';

// import { useMainStore } from '@/front/lib/zustand/store';

// import { Logo } from '../../Logo';
// import {
// 	// Sidebar,
// 	SidebarContent,
// 	SidebarFooter,
// 	SidebarGroup,
// 	SidebarGroupContent,
// 	SidebarHeader,
// 	SidebarLink,
// 	SidebarMenu,
// 	SidebarMenuItem,
// } from '../sidebar/Sidebar';
import { Sidebar } from '../sidebar/Sidebar2';

// import { UserProfile } from './UserProfile';

type NavDataBase = {
	name: string;
	href: string;
	icon: ComponentType;
	notifications?: false | number;
	active?: boolean;
};

export type NavData = (NavDataBase & {
	children?: NavDataBase;
})[];

export const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => {
	// const isOpenNav = useMainStore();
	// const setIsOpenNav = useMainStore();

	const navData = useNavData();

	// return (
	// 	<Drawer
	// 		opened={isOpenNav}
	// 		onClose={() => {
	// 			setIsOpenNav(false);
	// 		}}
	// 	/>
	// );

	return (
		<Sidebar {...props} className="bg-gray-50 dark:bg-gray-925">
			{/* <SidebarHeader className="px-3 py-4">
				<div className="flex items-center gap-3">
					<span className="flex size-9 items-center justify-center rounded-md bg-white p-1.5 shadow-xs ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
						<Logo className="size-6 text-blue-500 dark:text-blue-500" />
					</span>
					<div>
						<span className="block text-sm font-semibold text-gray-900 dark:text-gray-50">Innovex Systems</span>
						<span className="block text-xs text-gray-900 dark:text-gray-50">Premium Starter Plan</span>
					</div>
				</div>
			</SidebarHeader> */}
			{/* <SidebarContent>
				<SidebarGroup className="pt-0">
					<SidebarGroupContent>
						<SidebarMenu className="space-y-1">
							{navData.map((item) => {
								return (
									<SidebarMenuItem key={item.name}>
										<SidebarLink
											href={item.href}
											isActive={item.active}
											icon={item.icon}
											notifications={item.notifications}
										>
											{item.name}
										</SidebarLink>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent> */}
			{/* <SidebarFooter>
				<div className="border-t border-gray-200 dark:border-gray-800" />
				<UserProfile />
			</SidebarFooter> */}
		</Sidebar>
	);
};
