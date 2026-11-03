import { cn } from '~/lib/utils';

/**
 * A segmented control over a few codes (Shopkart OS `segmented.tsx`): one
 * pressed button per code, each shown with its translated label.
 */
export const Segmented = <T extends string>({
	value,
	options,
	label,
	onChange,
	ariaLabel,
	className,
	itemClassName,
}: {
	value: T;
	options: readonly T[];
	label: (code: T) => string;
	onChange: (value: T) => void;
	ariaLabel?: string;
	className?: string;
	itemClassName?: string;
}) => (
	<div
		role="group"
		aria-label={ariaLabel}
		className={cn(
			'flex rounded-[var(--publy-radius-small-control)] bg-secondary p-0.5',
			className,
		)}
	>
		{options.map((option) => {
			const active = option === value;
			return (
				<button
					key={option}
					type="button"
					aria-pressed={active}
					onClick={() => onChange(option)}
					className={cn(
						'h-7 rounded-[var(--publy-radius-menu-item)] px-2 text-xs whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60',
						active &&
							'bg-background text-foreground shadow-[var(--publy-shadow-chrome)]',
						itemClassName,
					)}
				>
					{label(option)}
				</button>
			);
		})}
	</div>
);
