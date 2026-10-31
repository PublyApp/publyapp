import { IconArrowRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The one section card (Gray UI `MetricCardShell`, rendered as Shopkart OS's
 * `Card`): a raised `bg-card` shell with a 6px inset, an uppercase label row
 * (icon, optional quiet action) and a bordered inner block. StatCards stay
 * for figures; everything else — detail sections, charts, form previews,
 * danger zones — is a section card.
 */
export const SectionCard = ({
	label,
	icon,
	action,
	tone,
	children,
	className,
	contentClassName,
}: {
	label: ReactNode;
	icon?: ReactNode;
	action?: ReactNode;
	tone?: 'danger';
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}) => (
	<section
		className={cn(
			'flex flex-col rounded-[var(--publy-radius-control)] bg-card p-1.5 shadow-[var(--publy-shadow-chrome)]',
			className,
		)}
	>
		<div className="flex min-h-8 items-center justify-between gap-3 px-4 pt-1 pb-2">
			<span
				className={cn(
					'flex min-w-0 items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5 [&_svg]:shrink-0',
					tone === 'danger' && 'text-destructive',
				)}
			>
				{icon}
				<span className="truncate">{label}</span>
			</span>
			{action}
		</div>
		<div
			className={cn(
				'flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--publy-radius-medium-control)] border bg-background',
				contentClassName,
			)}
		>
			{children}
		</div>
	</section>
);

/**
 * A section card's quiet header action (Shopkart's « Voir tout »): a discreet
 * text link with a trailing arrow.
 */
export const SectionCardLink = ({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={onClick}
		className="group/link inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--publy-radius-small-control)] px-1.5 text-[13px] font-medium text-foreground/80 hover:text-foreground hover:underline hover:underline-offset-4"
	>
		{children}
		<IconArrowRight
			aria-hidden="true"
			className="size-3.5 transition-transform group-hover/link:translate-x-0.5"
		/>
	</button>
);
