import type { ReactNode } from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { getSecondaryPanelItems } from '~/lib/navigation/route-metadata';

type NeutralAuthedShellProps = {
	children: ReactNode;
	isRecovery?: boolean;
	pathname: string;
};

/**
 * Preserves only the public geometry of an authenticated route while the
 * browser validates the session. It deliberately contains no links, labels,
 * branding, identity, or authenticated mode marker.
 */
export const NeutralAuthedShell = ({
	children,
	isRecovery = false,
	pathname,
}: NeutralAuthedShellProps) => {
	const hasSecondaryPanel = getSecondaryPanelItems(pathname).length >= 2;

	return (
		<div
			aria-hidden={isRecovery ? undefined : 'true'}
			className="app-shell-workspace neutral-authed-shell"
			data-testid={
				isRecovery ? 'neutral-authed-recovery' : 'neutral-authed-shell'
			}
			data-has-secondary-panel={hasSecondaryPanel ? 'true' : undefined}
			data-panel-open={hasSecondaryPanel ? 'true' : 'false'}
			inert={isRecovery ? undefined : true}
			style={isRecovery ? { gridTemplateColumns: '1fr' } : undefined}
		>
			<div
				className="app-shell-rail"
				data-testid="neutral-authed-shell-rail"
				hidden={isRecovery}
			>
				<Skeleton className="mb-1 size-8" />
				<div className="app-shell-rail-links">
					<Skeleton className="size-8" />
					<Skeleton className="size-8" />
					<Skeleton className="size-8" />
				</div>
				<div className="app-shell-rail-spacer" />
			</div>

			{hasSecondaryPanel ? (
				<div className="app-shell-secondary-panel" hidden={isRecovery}>
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

			<div
				className="app-shell-body"
				style={
					isRecovery ? { gridColumn: '1', gridTemplateRows: '1fr' } : undefined
				}
			>
				<div
					className="app-shell-topbar"
					data-testid="neutral-authed-shell-topbar"
					hidden={isRecovery}
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
