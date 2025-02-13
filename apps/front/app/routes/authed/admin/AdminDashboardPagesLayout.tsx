import { Outlet } from 'react-router';

import { SidebarProvider, SidebarTrigger } from '@/front/components/tremor/Sidebar';
import { AppSidebar } from '@/front/components/ui/navigation/AppSidebar';
import { Breadcrumbs } from '@/front/components/ui/navigation/Breadcrumbs';

const AdminDashboardPagesLayout = () => {
	const defaultOpen = true;
	return (
		<SidebarProvider defaultOpen={defaultOpen}>
			<AppSidebar />
			<div className="w-full">
				<header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-950">
					<SidebarTrigger className="-ml-1" />
					<div className="mr-2 h-4 w-px bg-gray-200 dark:bg-gray-800" />
					<Breadcrumbs />
				</header>
				<main>
					<Outlet />
				</main>
			</div>
		</SidebarProvider>
	);
};

export default AdminDashboardPagesLayout;
