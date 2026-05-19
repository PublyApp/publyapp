import type { Dayjs } from '#app/utils/format-time.ts';

export type DateRange = {
	from: Dayjs | null;
	to: Dayjs | null;
};

export type DateRangePreset =
	| 'today'
	| 'yesterday'
	| 'last-7-days'
	| 'last-30-days'
	| 'last-90-days'
	| 'custom';

export type DateRangeFilterProps = {
	label?: string;
	value: DateRange;
	onChange: (value: DateRange) => void;
	minDate?: Dayjs;
	maxDate?: Dayjs;
};
