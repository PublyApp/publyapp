import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The one StatCard (Shopkart OS `stat-card.tsx`): a `@container` card shell,
 * an uppercase label row with its icon and optional action, then a bordered
 * inner block holding the figure (and its optional unit) above a footer.
 * The figure shrinks with the card (`clamp(20px, 13cqi, 30px)`), no
 * breakpoint. Used by every figure surface: dashboard, list pages, details.
 *
 * `children` is the figure (a suffix may stay in it, as detail pages do);
 * `secondary` is the footer, kept as the historical name for that slot.
 */
export const StatCard = ({
	testId,
	label,
	icon,
	value,
	unit,
	footer,
	secondary,
	action,
	unavailable,
	children,
	className,
}: {
	testId?: string;
	label: string;
	icon: ReactNode;
	/** The figure, when it is plain text (an alternative to `children`). */
	value?: ReactNode;
	/** A muted unit after the figure ("/ 205"). */
	unit?: string;
	footer?: ReactNode;
	/** Historical name for the footer slot. */
	secondary?: ReactNode;
	action?: ReactNode;
	/**
	 * The card's trend series (the delta and its sparkline) is not served yet:
	 * the footer keeps the delta's two-line height (36 px) for the caller's
	 * ghost sparkline and quiet line, and the figure falls back to « — » when
	 * none was given. A real figure (including a real 0) still shows as given.
	 */
	unavailable?: boolean;
	children?: ReactNode;
	className?: string;
}) => {
	const figure =
		value ??
		children ??
		(unavailable ? <span className="text-muted-foreground">—</span> : null);

	return (
		<div
			className={cn(
				// `shadow-(--token)`, not `shadow-[var(--token)]`: the v4 shorthand
				// is unambiguous so a caller's `className` can override it through
				// tailwind-merge (the bracket form never merges).
				'@container flex h-full min-w-0 flex-col rounded-[16px] bg-card p-1 text-card-foreground shadow-(--effect-raised-control)',
				className,
			)}
			data-testid={testId}
		>
			<div className="flex items-center justify-between gap-3 px-3 pt-1 pb-2">
				<div className="flex min-w-0 items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5 [&_svg]:shrink-0">
					{icon}
					<span className="truncate">{label}</span>
				</div>
				{action}
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-between gap-3 rounded-[var(--publy-radius-medium-control)] border bg-background p-3">
				<p className="text-[length:clamp(20px,13cqi,30px)] leading-8 font-medium tabular-nums">
					<span className="whitespace-nowrap">{figure}</span>
					{unit ? (
						<span className="ml-1 text-base text-muted-foreground md:text-lg">
							{unit}
						</span>
					) : null}
				</p>
				<div
					className={cn(
						'text-xs text-muted-foreground',
						unavailable
							? 'flex min-h-9 items-end justify-between gap-3'
							: '[&_svg]:inline [&_svg]:size-3.5 [&_svg]:align-[-2px]',
					)}
				>
					{footer ?? secondary}
				</div>
			</div>
		</div>
	);
};
