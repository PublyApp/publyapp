import type { ReactNode } from 'react';

import { AppSidebar } from '@/front/components/ui/navigation/AppSidebar';
import { Breadcrumbs } from '@/front/components/ui/navigation/Breadcrumbs';
import { SidebarProvider, SidebarTrigger, useSidebar } from '@/front/components/ui/sidebar/Sidebar';

import { cx } from '../../tremor/tremor.utils';

type Props = {
	children?: ReactNode;
	defaultOpenSideBar?: boolean;
};

type MainContainerProps = {
	children?: ReactNode;
};

const MainContainer = ({ children }: MainContainerProps) => {
	const { open } = useSidebar();

	return (
		<div
			className={cx({
				'w-[calc(100%-var(--sidebar-width))]': open,
				'w-full': !open,
			})}
		>
			{children}
		</div>
	);
};

const DashboardLayout = ({ children, defaultOpenSideBar }: Props) => {
	return (
		<SidebarProvider defaultOpen={defaultOpenSideBar}>
			<AppSidebar />
			<MainContainer>
				<header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-950">
					<SidebarTrigger className="-ml-1" />
					<div className="mr-2 h-4 w-px bg-gray-200 dark:bg-gray-800" />
					<Breadcrumbs />
				</header>
				<main>{children}</main>
			</MainContainer>
		</SidebarProvider>
	);
};

export default DashboardLayout;
