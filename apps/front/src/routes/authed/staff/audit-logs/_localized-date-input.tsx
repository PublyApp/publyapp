import { useState } from 'react';
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
	testId: string;
	min?: string;
	max?: string;
	className?: string;
	onChange: (isoDate: string | undefined) => void;
};

const LocalizedDateInputInner = ({
	value,
	locale,
	ariaLabel,
	testId,
	min,
	max,
	className,
	onChange,
}: LocalizedDateInputProps) => {
	const [draft, setDraft] = useState(() => formatLocalizedDate(value, locale));
	const [isInvalid, setIsInvalid] = useState(false);

	const commit = (raw: string): void => {
		const parsed = parseLocalizedDate(raw, locale);

		if (parsed === undefined) {
			setIsInvalid(raw.trim().length > 0);
			return;
		}

		if (parsed !== '' && ((min && parsed < min) || (max && parsed > max))) {
			setIsInvalid(true);
			return;
		}

		setIsInvalid(false);
		setDraft(formatLocalizedDate(parsed || undefined, locale));
		onChange(parsed === '' ? undefined : parsed);
	};

	return (
		<Input
			type="text"
			inputMode="numeric"
			autoComplete="off"
			spellCheck={false}
			aria-label={ariaLabel}
			aria-invalid={isInvalid || undefined}
			placeholder={localizedDatePlaceholder(locale)}
			data-testid={testId}
			value={draft}
			className={className}
			onBlur={(event) => commit(event.currentTarget.value)}
			onChange={(event) => {
				setDraft(event.currentTarget.value);
				if (event.currentTarget.value.trim().length === 0) {
					setIsInvalid(false);
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
	);
};

/**
 * #2291 M8: locale-formatted date filter whose URL value stays ISO. A native
 * `<input type="date">` cannot do this — Chromium renders its segments in the
 * browser locale and ignores the page `lang`.
 *
 * The key remounts the field when the URL value or the app locale changes, so
 * the displayed draft follows the authoritative value without a
 * prop-to-state effect.
 */
export const LocalizedDateInput = (props: LocalizedDateInputProps) => (
	<LocalizedDateInputInner
		key={`${props.value ?? ''}:${props.locale}`}
		{...props}
	/>
);
