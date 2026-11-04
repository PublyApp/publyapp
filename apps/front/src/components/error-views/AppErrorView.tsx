import type { ReactNode } from 'react';
import { errorToneFromCode } from '~/components/ui/error-tone';
import type { ErrorTone } from '~/components/ui/error-tone';
import { StateView } from '~/components/ui/state-view';
import { cn } from '~/lib/utils';

export type AppErrorTone = ErrorTone;

type AppErrorViewProps = {
	icon: ReactNode;
	title: string;
	code?: string;
	description?: string;
	actions?: ReactNode;
	/** Raw error text, folded under a collapsed "technical details" disclosure. */
	details?: string;
	detailsLabel?: string;
	diagnosticId?: string;
	testId?: string;
	/** Icon tint. Defaults to the tone of the visible `code` (404 neutral,
	 * 401/403 warning, otherwise danger). */
	tone?: AppErrorTone;
	/** Announcement role: `alert` for a failure, `status` for a self-healing
	 * state such as offline. */
	role?: 'alert' | 'status';
	/**
	 * Renders inside an existing page shell (a `<div>`, no `min-h-screen`)
	 * instead of a full-viewport `<main>`. Defaults to `true` — almost every
	 * call site lives inside the authed `<Outlet>`, which is already a
	 * `<main>` landmark of its own. Pass `embedded={false}` only for the
	 * genuine full-page uses: the root error boundary, the not-found route,
	 * and the auth surface.
	 */
	embedded?: boolean;
};

export const AppErrorView = ({
	icon,
	title,
	code,
	description,
	actions,
	details,
	detailsLabel,
	diagnosticId,
	testId,
	tone,
	role = 'alert',
	embedded = true,
}: AppErrorViewProps) => {
	const Wrapper = embedded ? 'div' : 'main';
	const resolvedTone = tone ?? errorToneFromCode(code);

	return (
		<Wrapper
			className={cn(
				'mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center',
				embedded
					? 'min-h-[50vh] justify-center py-8'
					: 'min-h-screen justify-center py-16',
			)}
			data-testid={testId}
		>
			<StateView
				icon={icon}
				tone={resolvedTone}
				scale="page"
				role={role}
				ariaLive={role === 'alert' ? 'assertive' : 'polite'}
				eyebrow={code}
				title={title}
				description={description}
				details={details}
				detailsLabel={detailsLabel}
				actions={actions}
				afterActions={
					diagnosticId ? (
						<div className="mt-3 w-full text-left text-xs text-muted-foreground">
							{diagnosticId}
						</div>
					) : null
				}
			/>
		</Wrapper>
	);
};
