import { type ReactNode } from 'react';

import { AppSidebar } from '@/front/components/ui/navigation/AppSidebar';
import { Breadcrumbs } from '@/front/components/ui/navigation/Breadcrumbs';
import { SidebarTrigger } from '@/front/components/ui/sidebar/Sidebar';
import { SIDEBAR_WIDTH } from '@/front/lib/constants';
import { selectSidebarState } from '@/front/lib/zustand/features/settings.slice';
import { useMainStore } from '@/front/lib/zustand/store';

import { cx } from '../../tremor/tremor.utils';

type Props = {
	children?: ReactNode;
};

type SidebarWrapperProps = {
	children?: ReactNode;
};

type MainContainerProps = {
	children?: ReactNode;
};

const SidebarWrapper = ({ children }: SidebarWrapperProps) => {
	return (
		<div
			style={
				{
					'--sidebar-width': SIDEBAR_WIDTH,
				} as React.CSSProperties
			}
			className={cx('flex min-h-svh w-full')}
		>
			{children}
		</div>
	);
};

const MainContainer = ({ children }: MainContainerProps) => {
	const sidebarState = useMainStore(selectSidebarState);
	const open = sidebarState === 'expanded';

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

const DashboardLayout = ({ children }: Props) => {
	return (
		<SidebarWrapper>
			<AppSidebar />
			<MainContainer>
				<header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-950">
					<SidebarTrigger className="-ml-1" />
					<div className="mr-2 h-4 w-px bg-gray-200 dark:bg-gray-800" />
					<Breadcrumbs />
				</header>
				<main>{children}</main>
			</MainContainer>
		</SidebarWrapper>
	);
};

export default DashboardLayout;
