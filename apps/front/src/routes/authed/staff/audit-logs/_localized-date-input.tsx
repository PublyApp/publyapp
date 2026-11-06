import { IconAlertCircle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Input } from '~/components/ui/input';
import {
	formatLocalizedDate,
	localizedDatePlaceholder,
	parseLocalizedDate,
} from '~/lib/dates/localized-date';

type LocalizedDateInputProps = {
	value: string | undefined;
	locale: string;
	ariaLabel: string;
	/** Visible, associated message for an unparseable or out-of-range date. */
	errorMessage: string;
	testId: string;
	min?: string;
	max?: string;
	className?: string;
	onChange: (isoDate: string | undefined) => void;
};

/** What the user typed, pinned to the external value it was typed against. */
type Draft = { text: string; value: string | undefined };
type DateError = { message: string; value: string | undefined };

const LocalizedDateInputInner = ({
	value,
	locale,
	ariaLabel,
	errorMessage,
	testId,
	min,
	max,
	className,
	onChange,
}: LocalizedDateInputProps) => {
	const errorId = useId();
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<DateError | null>(null);

	/*
	 * The external value is the source of truth until the user edits. Both the
	 * draft and the error are pinned to the value they were produced for, so an
	 * external change (URL back/forward, another filter reset) invalidates them
	 * without a prop-syncing effect and without remounting the input.
	 */
	const activeDraft = draft !== null && draft.value === value ? draft : null;
	const shown = activeDraft?.text ?? formatLocalizedDate(value, locale);
	const visibleError =
		error !== null && error.value === value ? error.message : '';

	const commit = (raw: string): void => {
		const parsed = parseLocalizedDate(raw, locale);

		if (parsed === undefined) {
			setError({ message: raw.trim().length > 0 ? errorMessage : '', value });
			return;
		}

		if (parsed !== '' && ((min && parsed < min) || (max && parsed > max))) {
			setError({ message: errorMessage, value });
			return;
		}

		setError(null);
		setDraft(null);
		onChange(parsed === '' ? undefined : parsed);
	};

	return (
		<div className="flex flex-col gap-1">
			<Input
				type="text"
				inputMode="numeric"
				autoComplete="off"
				spellCheck={false}
				aria-label={ariaLabel}
				aria-invalid={visibleError ? true : undefined}
				aria-errormessage={visibleError ? errorId : undefined}
				aria-describedby={visibleError ? errorId : undefined}
				placeholder={localizedDatePlaceholder(locale)}
				data-testid={testId}
				value={shown}
				className={className}
				onBlur={(event) => commit(event.currentTarget.value)}
				onChange={(event) => {
					const next = event.currentTarget.value;
					setDraft({ text: next, value });
					setError(null);
					if (next.trim().length === 0) {
						onChange(undefined);
					}
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commit(event.currentTarget.value);
					}
				}}
			/>
			{visibleError ? (
				<p id={errorId} className="publy-field-error" role="alert">
					<IconAlertCircle aria-hidden="true" />
					{visibleError}
				</p>
			) : null}
		</div>
	);
};

/**
 * #2291 M8: locale-formatted date filter whose URL value stays ISO. A native
 * `<input type="date">` cannot do this — Chromium renders its segments in the
 * browser locale and ignores the page `lang`.
 *
 * Only the locale remounts the field: remounting on `value` dropped focus
 * when clearing the filter, since the clear navigates synchronously.
 */
export const LocalizedDateInput = (props: LocalizedDateInputProps) => (
	<LocalizedDateInputInner key={props.locale} {...props} />
);
