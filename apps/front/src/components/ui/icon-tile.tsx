import type { TablerIcon } from '@tabler/icons-react';
import { cn } from '~/lib/utils';

/**
 * The one tinted icon tile (Shopkart `job-types.tsx` / role cell): a small
 * rounded square on a tinted background with a flat 1px inner ring. The tint
 * is the caller's existing colour source — a job family's palette entry
 * (`tint`) or a role's `tone`, which reuses the shared
 * `.publy-role-icon-tile[data-tone]` token pair. Never a colour of its own.
 */
export const IconTile = ({
	icon: Icon,
	tint,
	tone,
	size = 'md',
	className,
}: {
	icon: TablerIcon;
	/** A background colour (a job family's `var(--…)` tint). */
	tint?: string;
	/** The role tone index (`'0'`…`'7'`) driving the shared tile palette. */
	tone?: string;
	/** `sm` is the 24px table-cell tile, `md` the 28px default. */
	size?: 'sm' | 'md';
	className?: string;
}) => (
	<span
		aria-hidden="true"
		data-tone={tone}
		style={tint === undefined ? undefined : { background: tint }}
		className={cn(
			'publy-role-icon-tile flex shrink-0 items-center justify-center rounded-[7px] shadow-[inset_0_0_0_1px_var(--border)]',
			size === 'sm' ? 'size-6' : 'size-7',
			className,
		)}
	>
		<Icon aria-hidden="true" className="size-3.5" />
	</span>
);
