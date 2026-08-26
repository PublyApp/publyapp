import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

type StateViewTone = 'neutral' | 'danger' | 'primary';
type StateViewScale = 'page' | 'inline';

type StateViewProps = {
	icon: ReactNode;
	tone?: StateViewTone;
	scale: StateViewScale;
	/** Eyebrow line above the title (e.g. an error code). Omitted entirely
	 * when absent — that is the only structural difference the page and
	 * inline scales are allowed beyond typography (owner decision R3-4b). */
	eyebrow?: string;
	title: string;
	/** Extra content rendered directly under the title, before description. */
	belowTitle?: ReactNode;
	description?: string;
	/** Extra content rendered between description and actions. */
	beforeActions?: ReactNode;
	actions?: ReactNode;
	/** Extra content rendered after actions. */
	afterActions?: ReactNode;
	testId?: string;
	className?: string;
};

/**
 * Shared icon + eyebrow? + title + description + actions composition for
 * both AppErrorView (full-page) and StateSurface (inline list state) — a
 * table empty state and an error page must read as the same family (owner
 * decision R3-4b, 2026-07-10 round 3).
 */
export const StateView = ({
	icon,
	tone = 'neutral',
	scale,
	eyebrow,
	title,
	belowTitle,
	description,
	beforeActions,
	actions,
	afterActions,
	testId,
	className,
}: StateViewProps) => {
	const isPage = scale === 'page';
	const Heading = isPage ? 'h1' : 'div';

	const titleBlock = (
		<>
			<Heading className="mt-3 text-3xl font-semibold leading-tight">
				{title}
			</Heading>
			{belowTitle}
			{description ? (
				<p className="mt-2 text-sm text-muted-foreground">{description}</p>
			) : null}
		</>
	);

	return (
		<div
			className={cn(
				isPage
					? 'flex w-full flex-col items-center text-center'
					: 'publy-state-surface',
				className,
			)}
			data-tone={isPage ? undefined : tone}
			data-testid={testId}
		>
			<div
				className="publy-state-icon-cluster"
				data-tone={tone}
				data-scale={scale}
				aria-hidden="true"
			>
				<div className="publy-state-icon" data-tone={tone}>
					{icon}
				</div>
			</div>
			{eyebrow ? (
				<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
					{eyebrow}
				</p>
			) : null}
			{isPage ? titleBlock : <div>{titleBlock}</div>}
			{beforeActions}
			{actions ? (
				<div className="mt-8 flex w-full flex-wrap justify-center gap-2">
					{actions}
				</div>
			) : null}
			{afterActions}
		</div>
	);
};
