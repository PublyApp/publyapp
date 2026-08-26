import { IconSearch, IconX } from '@tabler/icons-react';
import type { ComponentProps } from 'react';
import { useRef } from 'react';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

/**
 * `default` inherits Input's own responsive height (44px mobile / 36px
 * desktop via `h-11 md:h-9`) — the shape every plain standalone search box
 * wants. `compact` forces a fixed 36px regardless of viewport, for tight
 * contexts like a popover. `table` forces the 40px data-table search height
 * (`.publy-data-table-search-input`, unchanged from before #975).
 */
type SearchInputSize = 'default' | 'compact' | 'table';

type SearchInputProps = Omit<
	ComponentProps<'input'>,
	'onChange' | 'type' | 'value' | 'size'
> & {
	value: string;
	onValueChange: (value: string) => void;
	clearLabel?: string;
	size?: SearchInputSize;
};

const SIZE_CLASS_NAME = {
	default: undefined,
	compact: 'h-9',
	table: 'publy-data-table-search-input',
} satisfies Record<SearchInputSize, string | undefined>;

/**
 * The one search-input primitive for the whole app (#975) — owns the
 * wrapper, the magnifier, the field, and exactly one clear button. It
 * replaces both of the app's prior hand-rolled scaffolds: `FilterInput`
 * (which rendered its own clear button *and* left the browser's native
 * `type="search"` cancel button visible — two clear buttons) and
 * `DataTableToolbar`'s inline scaffold (which rendered none).
 *
 * The caller's `className` lands on the OUTER wrapper, never the inner
 * `Input` — a caller-supplied vertical margin (e.g. `mt-2`) must move the
 * whole control together with its absolutely-positioned decorations, not
 * desynchronise them the way passing it through to the inner input did.
 * Use `size` to own the field's height instead of reaching for a height
 * utility in `className`.
 */
const SearchInput = ({
	value,
	onValueChange,
	clearLabel = 'Clear search',
	size = 'default',
	className,
	disabled,
	...props
}: SearchInputProps) => {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<div className={cn('publy-search-wrapper', className)}>
			<IconSearch aria-hidden="true" className="publy-search-icon" />
			<Input
				{...props}
				ref={inputRef}
				type="search"
				value={value}
				disabled={disabled}
				className={cn(
					'publy-search-input bg-background pl-9',
					value.length > 0 && 'pr-9',
					SIZE_CLASS_NAME[size],
				)}
				onChange={(event) => onValueChange(event.target.value)}
			/>
			{value.length > 0 ? (
				<button
					type="button"
					aria-label={clearLabel}
					disabled={disabled}
					className="publy-search-clear"
					onClick={() => {
						onValueChange('');
						inputRef.current?.focus();
					}}
				>
					<IconX aria-hidden="true" className="size-[18px]" />
				</button>
			) : null}
		</div>
	);
};

export { SearchInput };
export type { SearchInputProps, SearchInputSize };
