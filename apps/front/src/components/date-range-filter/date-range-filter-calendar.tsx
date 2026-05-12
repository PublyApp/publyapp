import Box from '@mui/material/Box';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import {
	PickersDay,
	type PickersDayProps,
} from '@mui/x-date-pickers/PickersDay';
import { useState } from 'react';

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
	const [pendingFrom, setPendingFrom] = useState<Dayjs | null>(value.from);

	const handlePick = (day: Dayjs | null) => {
		if (day === null) return;
		const isStartingFresh =
			pendingFrom === null || (value.from !== null && value.to !== null);
		if (isStartingFresh) {
			setPendingFrom(day);
			onChange({ from: day.startOf('day'), to: null });
			return;
		}
		const [from, to] = day.isBefore(pendingFrom, 'day')
			? [day, pendingFrom]
			: [pendingFrom, day];
		setPendingFrom(null);
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
						borderRadius: 0,
					}),
				}}
			/>
		);
	};

	return (
		<Box sx={{ p: 1 }}>
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
