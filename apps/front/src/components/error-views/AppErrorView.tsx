import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { errorToneFromCode } from '~/components/ui/error-tone';
import type { ErrorTone } from '~/components/ui/error-tone';
import { StateView } from '~/components/ui/state-view';
import {
	classifyError,
	errorKindFromCode,
	type ErrorKind,
} from '~/lib/error-kind';
import { useOnline } from '~/lib/hooks/use-online';
import { cn } from '~/lib/utils';

import { ErrorActions } from './error-actions';
import { ErrorKindState } from './error-kind-state';

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
	testId?: string;
	/** Icon tint. Defaults to the tone of `code` (404 neutral, 401/403
	 * warning, otherwise danger). */
	tone?: AppErrorTone;
	/** Announcement role: `alert` for a failure, `status` for a self-healing
	 * state such as offline. */
	role?: 'alert' | 'status';
	/** The real cause: takes the ShopKart per-kind mapping (icon, tone,
	 * actions and whether the raw cause is disclosed at all). */
	error?: unknown;
	/** An already-classified kind (the 403/404/offline wrappers). */
	kind?: ErrorKind;
	/** Inside a panel: only « Réessayer ». */
	panel?: boolean;
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
	testId,
	tone,
	role = 'alert',
	error,
	kind,
	panel = false,
	embedded = true,
}: AppErrorViewProps) => {
	const Wrapper = embedded ? 'div' : 'main';
	const resolvedTone = tone ?? errorToneFromCode(code);
	const online = useOnline();
	const titleRef = useRef<HTMLHeadingElement>(null);
	// The translated eyebrow still tells the old page views which family they
	// belong to; the real error wins when a caller has it. `signed_out` stays
	// on the legacy path on purpose — only the auth surfaces own logout.
	const resolvedKind =
		kind ??
		(error !== undefined
			? classifyError(error, online)
			: errorKindFromCode(code));

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
			{resolvedKind && resolvedKind !== 'signed_out' ? (
				<ErrorKindState
					scale="page"
					kind={resolvedKind}
					panel={panel}
					onRetry={onRetry}
					title={title}
					titleRef={titleRef}
					testId={testId ? `${testId}-state` : undefined}
				/>
			) : (
				<StateView
					icon={icon}
					tone={resolvedTone}
					scale="page"
					role={role}
					ariaLive={role === 'alert' ? 'assertive' : 'polite'}
					title={title}
					titleRef={titleRef}
					description={description}
					actions={
						actions ?? <ErrorActions retry={onRetry} backOnly={backOnly} />
					}
				/>
			)}
		</Wrapper>
	);
};
