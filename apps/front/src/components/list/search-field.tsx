import { IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
	testId,
	disabled,
	delayMs = SEARCH_DELAY_MS,
}: {
	q: string;
	onSearch: (q: string | undefined) => void;
	placeholder: string;
	ariaLabel?: string;
	/** Follows the DataTable `${testId}-search` convention. */
	testId?: string;
	disabled?: boolean;
	delayMs?: number;
}) => {
	const { t } = useTranslation('common');
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

	const inputRef = useRef<HTMLInputElement>(null);
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

	const clear = () => {
		clearTimeout(timer.current);
		setText('');
		setWritten('');
		onSearch(undefined);
		inputRef.current?.focus();
	};

	return (
		<div className="relative max-w-[448px] flex-[1_1_300px]">
			<IconSearch
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				ref={inputRef}
				type="search"
				value={text}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel ?? placeholder}
				data-testid={testId}
				disabled={disabled}
				className={`publy-search-input h-11 w-full rounded-[var(--publy-radius-control)] border border-transparent bg-background pl-9 text-sm shadow-[var(--effect-raised-control)] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 md:h-10 ${text.length > 0 ? 'pr-9' : 'pr-3'}`}
			/>
			{text.length > 0 ? (
				<button
					type="button"
					aria-label={t('clear-search')}
					disabled={disabled}
					className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[var(--publy-radius-sm)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
					onClick={clear}
				>
					<IconX aria-hidden="true" className="size-[18px]" />
				</button>
			) : null}
		</div>
	);
};
