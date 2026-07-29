import Box from '@mui/material/Box';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import {
	PickersDay,
	type PickersDayProps,
} from '@mui/x-date-pickers/PickersDay';

import { type Dayjs } from '#app/utils/format-time.ts';

import { DateRangeCalendarHeader } from './date-range-filter-calendar-header';
import type { DateRange } from './date-range-filter.types';

type DateRangeFilterCalendarProps = {
	value: DateRange;
	onChange: (next: DateRange) => void;
	minDate?: Dayjs;
	maxDate?: Dayjs;
};

const isInRange = (
	day: Dayjs,
	from: Dayjs | null,
	to: Dayjs | null,
): boolean => {
	if (from === null || to === null) return false;
	return (
		(day.isAfter(from, 'day') || day.isSame(from, 'day')) &&
		(day.isBefore(to, 'day') || day.isSame(to, 'day'))
	);
};

const isEndpoint = (
	day: Dayjs,
	from: Dayjs | null,
	to: Dayjs | null,
): boolean => {
	const matchesFrom = from !== null && day.isSame(from, 'day');
	const matchesTo = to !== null && day.isSame(to, 'day');
	return matchesFrom || matchesTo;
};

export const DateRangeFilterCalendar = ({
	value,
	onChange,
	minDate,
	maxDate,
}: DateRangeFilterCalendarProps) => {
	// When `to` is null, `from` is an in-progress anchor
	// used only for previewing the range until the second
	// click commits the end date.
	const pendingFrom = value.to === null ? value.from : null;

	const handlePick = (day: Dayjs | null) => {
		if (day === null) return;
		const isStartingFresh = pendingFrom === null || value.to !== null;
		if (isStartingFresh) {
			onChange({ from: day.startOf('day'), to: null });
			return;
		}
		const [from, to] = day.isBefore(pendingFrom, 'day')
			? [day, pendingFrom]
			: [pendingFrom, day];
		onChange({
			from: from.startOf('day'),
			to: to.endOf('day'),
		});
	};

	const renderDay = (props: PickersDayProps) => {
		const endpoint = isEndpoint(props.day, value.from, value.to);
		const inRange =
			!endpoint && isInRange(props.day, value.from, value.to ?? pendingFrom);
		return (
			<PickersDay
				{...props}
				selected={endpoint || props.selected}
				sx={{
					...(inRange && {
						bgcolor: 'action.selected',
					}),
				}}
			/>
		);
	};

	return (
		<Box
			sx={{
				p: { xs: 0.5, sm: 1 },
				maxWidth: '100%',
				'& .MuiDateCalendar-root': {
					width: { xs: '100%', sm: 320 },
					maxWidth: '100%',
				},
			}}
		>
			<DateCalendar
				value={value.from}
				onChange={handlePick}
				minDate={minDate}
				maxDate={maxDate}
				views={['year', 'month', 'day']}
				openTo="day"
				slots={{ day: renderDay, calendarHeader: DateRangeCalendarHeader }}
			/>
		</Box>
	);
};
