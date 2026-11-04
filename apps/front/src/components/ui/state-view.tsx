import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

type StateViewTone = 'neutral' | 'danger' | 'primary';
type StateViewScale = 'page' | 'inline';
type StateViewPresentation = 'plain' | 'empty';

type StateViewProps = {
	icon: ReactNode;
	tone?: StateViewTone;
	scale: StateViewScale;
	ariaLive?: 'polite' | 'assertive' | 'off';
	/** Explicit ARIA role. Error surfaces use `alert` (owner decision #2291);
	 * everything else keeps the historical `status` derived from ariaLive. */
	role?: 'alert' | 'status';
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
	/** `empty` is the ShopKart OS empty-collection shape: two faint rings
	 * around a −6° tilted tile (owner decision 04/11). `plain` is the flat
	 * glyph family the error views and page states keep. */
	presentation?: StateViewPresentation;
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
	ariaLive,
	role,
	eyebrow,
	title,
	belowTitle,
	description,
	beforeActions,
	actions,
	afterActions,
	presentation = 'plain',
	testId,
	className,
}: StateViewProps) => {
	const isPage = scale === 'page';
	const isEmpty = presentation === 'empty';
	const Heading = isPage ? 'h1' : 'div';

	const titleBlock = (
		<>
			<Heading
				className={cn(
					'mt-3 font-semibold',
					isEmpty
						? 'text-lg leading-[1.3] text-balance'
						: 'text-3xl leading-tight',
				)}
			>
				{title}
			</Heading>
			{belowTitle}
			{description ? (
				<p
					className={
						isEmpty
							? 'mt-1.5 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground'
							: 'mt-2 text-sm text-muted-foreground'
					}
				>
					{description}
				</p>
			) : null}
		</>
	);

	return (
		<div
			role={role ?? (ariaLive ? 'status' : undefined)}
			aria-live={ariaLive}
			className={cn(
				isPage
					? 'flex w-full flex-col items-center text-center'
					: 'publy-state-surface',
				className,
			)}
			data-tone={isPage ? undefined : tone}
			data-presentation={isEmpty ? 'empty' : undefined}
			data-testid={testId}
		>
			<div
				className="publy-state-icon-cluster"
				data-tone={tone}
				data-scale={scale}
				data-presentation={isEmpty ? 'empty' : undefined}
				aria-hidden="true"
			>
				{isEmpty ? (
					// Two faint rings as SVG circles: a 50%-radius div is banned by
					// the rounded-radius guard, and a circle gets the exact geometry
					// (120px box, 1px stroke) without one.
					<svg
						className="absolute inset-0 size-[120px]"
						viewBox="0 0 120 120"
						aria-hidden="true"
					>
						<circle className="publy-empty-ring" cx="60" cy="60" r="59.5" />
						<circle
							className="publy-empty-ring publy-empty-ring--inner"
							cx="60"
							cy="60"
							r="45.5"
						/>
					</svg>
				) : null}
				<div
					className="publy-state-icon"
					data-tone={tone}
					data-presentation={isEmpty ? 'empty' : undefined}
				>
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
				<div
					className={cn(
						'flex w-full flex-wrap justify-center gap-2',
						isEmpty ? 'mt-5' : 'mt-8',
					)}
				>
					{actions}
				</div>
			) : null}
			{afterActions}
		</div>
	);
};
