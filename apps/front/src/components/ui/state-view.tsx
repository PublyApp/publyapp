import type { ReactNode, Ref } from 'react';
import { cn } from '~/lib/utils';

type StateViewTone = 'info' | 'neutral' | 'warning' | 'danger' | 'primary';
type StateViewScale = 'page' | 'inline';
/** `empty` is the neutral empty-collection shape; `status` is the tinted
 * error/status shape. Both are the ShopKart OS pictogram (owner decision
 * 04/11): two faint rings around a −6° tilted tile carrying the icon. */
type StateViewPresentation = 'status' | 'empty';

type StateViewProps = {
	icon: ReactNode;
	tone?: StateViewTone;
	scale: StateViewScale;
	ariaLive?: 'polite' | 'assertive' | 'off';
	/** Explicit ARIA role. Error surfaces use `alert` (owner decision #2291);
	 * a self-healing status (offline) uses `status`. */
	role?: 'alert' | 'status';
	title: string;
	/** Extra content rendered directly under the title, before description. */
	belowTitle?: ReactNode;
	description?: ReactNode;
	/** Extra content rendered between description and actions. */
	beforeActions?: ReactNode;
	actions?: ReactNode;
	/** Extra content rendered after actions. */
	afterActions?: ReactNode;
	presentation?: StateViewPresentation;
	testId?: string;
	className?: string;
	/** Lets a page-scale caller move focus to the title after an error
	 * navigation (a11y requirement, owner decision 04/11). */
	titleRef?: Ref<HTMLHeadingElement>;
};

/**
 * Shared icon + title + description + actions composition for
 * both AppErrorView (full-page) and StateSurface (inline list state) — a
 * table empty state and an error page must read as the same family (owner
 * decision R3-4b, 2026-07-10 round 3). Its pictogram is the ShopKart OS
 * shape for empty and error/status alike (owner decision 04/11).
 */
export const StateView = ({
	icon,
	tone = 'neutral',
	scale,
	ariaLive,
	role,
	title,
	belowTitle,
	description,
	beforeActions,
	actions,
	afterActions,
	presentation = 'status',
	testId,
	className,
	titleRef,
}: StateViewProps) => {
	const isPage = scale === 'page';
	const isEmpty = presentation === 'empty';
	const Heading = isPage ? 'h1' : 'div';

	const titleBlock = (
		<>
			<Heading
				ref={isPage ? titleRef : undefined}
				tabIndex={isPage ? -1 : undefined}
				className={cn(
					'leading-[1.3] font-semibold text-balance',
					isEmpty ? 'mt-3 text-lg' : 'mt-4 text-xl focus:outline-none',
				)}
			>
				{title}
			</Heading>
			{belowTitle}
			{description ? (
				<p className="mt-2 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground">
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
					? 'flex w-full max-w-sm flex-col items-center text-center'
					: 'publy-state-surface mx-auto w-full max-w-sm',
				className,
			)}
			data-tone={isPage ? undefined : tone}
			data-presentation={presentation}
			data-testid={testId}
		>
			<div
				className="publy-state-icon-cluster"
				data-tone={tone}
				data-scale={scale}
				data-presentation={presentation}
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
				) : (
					// ShopKart OS error/status pictogram: 144px rings at 30 % / 60 %
					// opacity around a 64px tile, tinted by tone.
					<svg
						className="absolute inset-0 size-36"
						viewBox="0 0 144 144"
						aria-hidden="true"
					>
						<circle className="publy-status-ring" cx="72" cy="72" r="71.5" />
						<circle
							className="publy-status-ring publy-status-ring--inner"
							cx="72"
							cy="72"
							r="55.5"
						/>
					</svg>
				)}
				<div
					className="publy-state-icon"
					data-tone={tone}
					data-presentation={presentation}
				>
					{icon}
				</div>
			</div>
			{isPage ? titleBlock : <div>{titleBlock}</div>}
			{beforeActions}
			{actions ? (
				<div
					className={cn(
						isEmpty
							? 'mt-5 flex flex-wrap justify-center gap-2'
							: 'mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center',
					)}
				>
					{actions}
				</div>
			) : null}
			{afterActions}
		</div>
	);
};
