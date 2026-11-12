import { LocalizedParsedInput } from '~/components/localized-parsed-input';
import type { OmitFromParsedInputProps } from '~/components/localized-parsed-input';
import { isFrench } from '~/lib/dates/localized-date';
import {
	formatLocalizedTime,
	localizedTimePlaceholder,
	parseLocalizedTime,
} from '~/lib/dates/localized-time';

type LocalizedTimeInputProps = OmitFromParsedInputProps<
	'format' | 'parse' | 'placeholder' | 'isOutOfRange'
> & {
	locale: string;
};

/** #2410: time of day in the UI language's convention (24 h « 10:30 » in
 * French, 12 h « 10:30 AM » in English); the value stays `HH:mm`. Same
 * contract as `LocalizedDateInput`. */
export const LocalizedTimeInput = ({
	locale,
	...props
}: LocalizedTimeInputProps) => (
	<LocalizedParsedInput
		key={locale}
		{...props}
		placeholder={localizedTimePlaceholder(locale)}
		format={(value) => formatLocalizedTime(value, locale)}
		parse={parseLocalizedTime}
		// English needs « AM » / « PM »: no numeric-only keypad.
		inputMode={isFrench(locale) ? 'numeric' : 'text'}
	/>
);
