import { Skeleton } from '~/components/ui/skeleton';

export const AuthedRouteContentSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex w-full flex-col gap-6"
		data-testid="authed-route-content-skeleton"
	>
		<div className="flex flex-col gap-2">
			<Skeleton className="h-7 w-48" />
			<Skeleton className="h-4 w-72 max-w-full" />
		</div>
		<Skeleton className="h-12 w-full" />
		<Skeleton className="h-64 w-full" />
	</div>
);
