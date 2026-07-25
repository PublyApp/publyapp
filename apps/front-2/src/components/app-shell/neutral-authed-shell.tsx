import type { ReactNode } from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { getSecondaryPanelItems } from '~/lib/navigation/route-metadata';

type NeutralAuthedShellProps = {
	children: ReactNode;
	pathname: string;
};

/**
 * Preserves only the public geometry of an authenticated route while the
 * browser validates the session. It deliberately contains no links, labels,
 * branding, identity, or authenticated mode marker.
 */
export const NeutralAuthedShell = ({
	children,
	pathname,
}: NeutralAuthedShellProps) => {
	const hasSecondaryPanel = getSecondaryPanelItems(pathname).length >= 2;

	return (
		<div
			aria-hidden="true"
			className="app-shell-workspace neutral-authed-shell"
			data-testid="neutral-authed-shell"
			data-has-secondary-panel={hasSecondaryPanel ? 'true' : undefined}
			data-panel-open={hasSecondaryPanel ? 'true' : 'false'}
			inert
		>
			<div className="app-shell-rail" data-testid="neutral-authed-shell-rail">
				<Skeleton className="mb-1 size-8" />
				<div className="app-shell-rail-links">
					<Skeleton className="size-8" />
					<Skeleton className="size-8" />
					<Skeleton className="size-8" />
				</div>
				<div className="app-shell-rail-spacer" />
			</div>

			{hasSecondaryPanel ? (
				<div className="app-shell-secondary-panel">
					<div className="app-shell-secondary-panel-inner">
						<div className="app-shell-secondary-header">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-[22px] w-16 rounded-md" />
						</div>
						<div className="app-shell-secondary-nav">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					</div>
				</div>
			) : null}

			<div className="app-shell-body">
				<div
					className="app-shell-topbar"
					data-testid="neutral-authed-shell-topbar"
				>
					<div className="app-shell-topbar-left">
						{hasSecondaryPanel ? <Skeleton className="size-8" /> : null}
						<Skeleton className="h-4 w-24" />
					</div>
					<div className="app-shell-topbar-right">
						<Skeleton className="size-9 rounded-md" />
						<Skeleton className="size-7 rounded-md" />
					</div>
				</div>
				<main className="app-shell-main">{children}</main>
			</div>
		</div>
	);
};
