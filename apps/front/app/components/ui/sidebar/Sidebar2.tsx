import { forwardRef } from 'react';

import { selectSidebarState } from '@/front/lib/zustand/features/settings.slice';
import { useMainStore } from '@/front/lib/zustand/store';

import { cx } from '../../tremor/tremor.utils';

export const Sidebar = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
	({ className, children, ...props }, ref) => {
		// const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
		const sidebarState = useMainStore(selectSidebarState);

		// if (isMobile) {
		// 	return (
		// 		<Drawer open={openMobile} onOpenChange={setOpenMobile} {...props}>
		// 			<DrawerContent
		// 				// data-sidebar="sidebar"
		// 				// data-mobile="true"
		// 				className="bg-gray-50 p-0 text-gray-900"
		// 			>
		// 				<VisuallyHidden.Root>
		// 					<DrawerTitle>Sidebar</DrawerTitle>
		// 				</VisuallyHidden.Root>
		// 				<div className="relative flex h-full w-full flex-col">
		// 					<DrawerClose className="absolute right-4 top-4" asChild>
		// 						<Button
		// 							variant="ghost"
		// 							className="p-2! text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50"
		// 						>
		// 							<RiCloseLine className="size-5 shrink-0" aria-hidden="true" />
		// 						</Button>
		// 					</DrawerClose>
		// 					{children}
		// 				</div>
		// 			</DrawerContent>
		// 		</Drawer>
		// 	);
		// }

		return (
			<div
				ref={ref}
				className={cx('group peer')}
				data-state={sidebarState}
				data-collapsed={sidebarState === 'collapsed'}
			>
				{/* This is what handles the sidebar gap on desktop */}
				<div
					className={cx(
						'relative h-svh w-(--sidebar-width) bg-transparent transition-[width] duration-150 ease-in-out will-change-transform',
						'group-data-[collapsed=true]:w-0',
					)}
				/>
				<div
					className={cx(
						'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-150 ease-in-out will-change-transform md:flex',
						'left-0 group-data-[collapsed=true]:left-[calc(var(--sidebar-width)*-1)]',
						'border-r border-gray-200 dark:border-gray-800',
						className,
					)}
					{...props}
				>
					<div data-sidebar="sidebar" className="bg-sidebar flex h-full w-full flex-col">
						{children}
					</div>
				</div>
			</div>
		);
	},
);
Sidebar.displayName = 'Sidebar';
