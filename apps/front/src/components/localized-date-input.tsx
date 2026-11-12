import { LocalizedParsedInput } from '~/components/localized-parsed-input';
import type { LocalizedParsedInputProps } from '~/components/localized-parsed-input';
import {
	formatLocalizedDate,
	localizedDatePlaceholder,
	parseLocalizedDate,
} from '~/lib/dates/localized-date';

type LocalizedDateInputProps = Omit<
	LocalizedParsedInputProps,
	'format' | 'parse' | 'placeholder' | 'isOutOfRange'
> & {
	locale: string;
	min?: string;
	max?: string;
};

/**
 * #2291 M8: locale-formatted date filter whose URL value stays ISO. A native
 * `<input type="date">` cannot do this — Chromium renders its segments in the
 * browser locale and ignores the page `lang`.
 *
 * Only the locale remounts the field: remounting on `value` dropped focus
 * when clearing the filter, since the clear navigates synchronously.
 */
export const LocalizedDateInput = ({
	locale,
	min,
	max,
	...props
}: LocalizedDateInputProps) => (
	<LocalizedParsedInput
		key={locale}
		{...props}
		placeholder={localizedDatePlaceholder(locale)}
		format={(value) => formatLocalizedDate(value, locale)}
		parse={(raw) => parseLocalizedDate(raw, locale)}
		isOutOfRange={(parsed) =>
			Boolean((min && parsed < min) || (max && parsed > max))
		}
	/>
);
