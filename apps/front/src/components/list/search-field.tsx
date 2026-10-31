import { IconSearch } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

/** How long the text rests before it reaches the URL (and the list). */
export const SEARCH_DELAY_MS = 200;

/**
 * A list page's text search (Shopkart OS `search-field.tsx`). The field
 * answers every key at once; `onSearch` follows once typing rests for
 * `delayMs` (the caller writes it to the URL). A `q` the field did not write
 * (a back button, a link) replaces the text.
 */
export const SearchField = ({
	q,
	onSearch,
	placeholder,
	ariaLabel,
	disabled,
	delayMs = SEARCH_DELAY_MS,
}: {
	q: string;
	onSearch: (q: string | undefined) => void;
	placeholder: string;
	ariaLabel?: string;
	disabled?: boolean;
	delayMs?: number;
}) => {
	const [text, setText] = useState(q);
	const [seen, setSeen] = useState(q);
	const [written, setWritten] = useState(q);

	if (q !== seen) {
		setSeen(q);
		if (q !== written) {
			setText(q);
			setWritten(q);
		}
	}

	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const onChange = (value: string) => {
		setText(value);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			setWritten(value);
			onSearch(value.length > 0 ? value : undefined);
		}, delayMs);
	};

	return (
		<div className="relative max-w-md flex-[1_1_300px]">
			<IconSearch
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="search"
				value={text}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel ?? placeholder}
				disabled={disabled}
				className="h-11 w-full rounded-[var(--publy-radius-medium-control)] border border-transparent bg-background pr-3 pl-9 text-sm shadow-[var(--publy-shadow-chrome)] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 md:h-10"
			/>
		</div>
	);
};
