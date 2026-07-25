import { IconSearch } from '@tabler/icons-react';
import type { ComponentProps } from 'react';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

type FilterInputProps = Omit<
	ComponentProps<'input'>,
	'onChange' | 'type' | 'value'
> & {
	value: string;
	onValueChange: (value: string) => void;
	clearLabel?: string;
};

const FilterInput = ({
	value,
	onValueChange,
	clearLabel = 'Clear filter',
	className,
	disabled,
	...props
}: FilterInputProps) => {
	return (
		<div className="publy-search-wrapper">
			<IconSearch aria-hidden="true" className="publy-search-icon" />
			<Input
				{...props}
				type="search"
				value={value}
				disabled={disabled}
				className={cn(
					'bg-background pl-9',
					value.length > 0 && 'pr-9',
					className,
				)}
				onChange={(event) => onValueChange(event.target.value)}
			/>
			{value.length > 0 ? (
				<button
					type="button"
					aria-label={clearLabel}
					disabled={disabled}
					className="absolute right-2 inline-flex size-6 items-center justify-center rounded-[var(--publy-radius-sm)] text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
					onClick={() => onValueChange('')}
				>
					<span aria-hidden="true">×</span>
				</button>
			) : null}
		</div>
	);
};

export { FilterInput };
export type { FilterInputProps };
