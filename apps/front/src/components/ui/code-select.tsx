import { IconSelector } from '@tabler/icons-react';
import { useState } from 'react';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { useMediaQuery } from '~/lib/hooks/use-media-query';
import { cn } from '~/lib/utils';

/**
 * Select over a list of codes, each shown with its translated label
 * (Shopkart OS `code-select.tsx`). From `md` it is the app's own Select;
 * below `md` the same trigger opens a bottom sheet of options instead — no
 * anchored popup on a phone.
 */
export const CodeSelect = <T extends string>({
	id,
	value,
	options,
	label,
	onChange,
	className,
	size,
	ariaLabel,
	disabled,
}: {
	id?: string;
	value: T;
	options: readonly T[];
	label: (code: T) => string;
	onChange: (value: T) => void;
	className?: string;
	size?: 'sm' | 'default';
	ariaLabel?: string;
	disabled?: boolean;
}) => {
	const wide = useMediaQuery('(min-width: 768px)');
	const [sheetOpen, setSheetOpen] = useState(false);

	if (wide) {
		return (
			<Select
				value={value}
				disabled={disabled}
				onValueChange={(next) => {
					if (next) {
						onChange(next);
					}
				}}
			>
				<SelectTrigger
					id={id}
					size={size}
					aria-label={ariaLabel}
					className={className}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{label(option)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	return (
		<>
			<button
				{...(id ? { id } : {})}
				type="button"
				disabled={disabled}
				aria-label={ariaLabel}
				aria-haspopup="dialog"
				aria-expanded={sheetOpen}
				onClick={() => setSheetOpen(true)}
				className={cn(
					'flex h-9 w-full items-center justify-between gap-1.5 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
					className,
				)}
			>
				<span className="truncate">{label(value)}</span>
				<IconSelector
					aria-hidden="true"
					className="size-4 text-muted-foreground"
				/>
			</button>
			<BottomSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				title={ariaLabel ?? ''}
			>
				<ul className="flex flex-col p-1">
					{options.map((option) => (
						<li key={option}>
							<button
								type="button"
								aria-pressed={option === value}
								onClick={() => {
									onChange(option);
									setSheetOpen(false);
								}}
								className="flex h-11 w-full items-center rounded-[var(--publy-radius-small-control)] px-3 text-left text-[15px] hover:bg-secondary aria-pressed:font-medium"
							>
								{label(option)}
							</button>
						</li>
					))}
				</ul>
			</BottomSheet>
		</>
	);
};
