import { IconLoader2 } from '@tabler/icons-react';
import { useLocation } from '@tanstack/react-router';
import { isTenantPortalPath } from '~/lib/route-shell';

import { AuthedRouteContentSkeleton } from './_route-content-skeleton';

// TanStack Start renders this as the route's SSR fallback and its
// pre-hydration ClientOnly fallback for this `ssr: false` route. Shell
// ownership deliberately stays above the route match in RoutedShell: an
// internal redirect such as `/staff` -> `/staff/staff-users` replaces this
// content fallback, but it cannot replace the real AppShell or create a
// second Zustand-backed shell mount. Keeping the pending component
// store-free preserves the persisted secondary-panel geometry contract.
export const AuthedRoutePendingSkeleton = () => {
	const location = useLocation();
	const pathname = location.pathname ?? '';

	// Only the exact `/tenant` portal root renders bare (RoutedShell bypasses
	// the AppShell for it — see `isTenantPortalPath`), so its pending surface
	// is a full-viewport centered loader. Tenant CHILD paths mount inside the
	// AppShell and get the normal AppShell-shaped content skeleton.
	if (isTenantPortalPath(pathname)) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<IconLoader2
					aria-hidden="true"
					className="size-8 animate-spin text-muted-foreground"
				/>
			</div>
		);
	}

	return <AuthedRouteContentSkeleton />;
};
