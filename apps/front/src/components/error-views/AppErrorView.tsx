import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { errorToneFromCode } from '~/components/ui/error-tone';
import type { ErrorTone } from '~/components/ui/error-tone';
import { StateView } from '~/components/ui/state-view';
import { cn } from '~/lib/utils';

import { ErrorActions } from './error-actions';

export type AppErrorTone = ErrorTone;

type AppErrorViewProps = {
	icon: ReactNode;
	title: string;
	/** Drives the pictogram tone only (404 neutral, 401/403 warning, else
	 * danger). It is never rendered: ShopKart OS has no eyebrow line. */
	code?: string;
	description?: string;
	/** Retry handler. Omitted: the pair's « Réessayer » invalidates the
	 * current route (ShopKart's `NotFoundState` behaviour). */
	onRetry?: () => void;
	/** 403: the home button is the primary and there is no retry. */
	backOnly?: boolean;
	/** Auth surfaces only (e.g. « Se reconnecter »): overrides the pair. */
	actions?: ReactNode;
	/** Raw error text, folded under a collapsed "technical details" disclosure. */
	details?: string;
	detailsLabel?: string;
	testId?: string;
	/** Icon tint. Defaults to the tone of `code` (404 neutral, 401/403
	 * warning, otherwise danger). */
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
	onRetry,
	backOnly,
	actions,
	details,
	detailsLabel,
	testId,
	tone,
	role = 'alert',
	embedded = true,
}: AppErrorViewProps) => {
	const Wrapper = embedded ? 'div' : 'main';
	const resolvedTone = tone ?? errorToneFromCode(code);
	const titleRef = useRef<HTMLHeadingElement>(null);

	// After an error navigation, keyboard and screen-reader users land on the
	// title rather than the top of a page they have already read.
	useEffect(() => {
		titleRef.current?.focus();
	}, []);

	return (
		<Wrapper
			className={cn(
				'mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center',
				embedded
					? 'min-h-[60dvh] justify-center py-10'
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
				title={title}
				titleRef={titleRef}
				description={description}
				details={details}
				detailsLabel={detailsLabel}
				actions={
					actions ?? <ErrorActions retry={onRetry} backOnly={backOnly} />
				}
			/>
		</Wrapper>
	);
};
