import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { PickersCalendarHeaderProps } from '@mui/x-date-pickers/PickersCalendarHeader';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { dayjs, type Dayjs } from '#app/utils/format-time.ts';

type Props = PickersCalendarHeaderProps & {
	minDate?: Dayjs;
	maxDate?: Dayjs;
};

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const buildYearList = (
	current: number,
	minYear: number,
	maxYear: number,
): number[] => {
	const result: number[] = [];
	for (let y = minYear; y <= maxYear; y++) {
		result.push(y);
	}
	if (!result.includes(current)) {
		result.push(current);
		result.sort((a, b) => a - b);
	}
	return result;
};

export const DateRangeCalendarHeader = ({
	currentMonth,
	onMonthChange,
	minDate,
	maxDate,
}: Props) => {
	const month = currentMonth.month();
	const year = currentMonth.year();

	const minYear = minDate?.year() ?? dayjs().year() - 10;
	const maxYear = maxDate?.year() ?? dayjs().year() + 1;
	const years = buildYearList(year, minYear, maxYear);

	const handlePrev = () => {
		onMonthChange(currentMonth.subtract(1, 'month'));
	};
	const handleNext = () => {
		onMonthChange(currentMonth.add(1, 'month'));
	};
	const handleMonth = (next: number) => {
		onMonthChange(currentMonth.month(next));
	};
	const handleYear = (next: number) => {
		onMonthChange(currentMonth.year(next));
	};

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 0.5,
				px: 1,
				py: 0.5,
			}}
		>
			<Select
				size="small"
				value={month}
				onChange={(e) => handleMonth(Number(e.target.value))}
				sx={{
					flexGrow: 1,
					'& .MuiSelect-select': { py: 0.5 },
				}}
			>
				{MONTH_INDEXES.map((i) => (
					<MenuItem key={i} value={i}>
						{dayjs().month(i).format('MMMM')}
					</MenuItem>
				))}
			</Select>
			<Select
				size="small"
				value={year}
				onChange={(e) => handleYear(Number(e.target.value))}
				sx={{ '& .MuiSelect-select': { py: 0.5 } }}
			>
				{years.map((y) => (
					<MenuItem key={y} value={y}>
						{y}
					</MenuItem>
				))}
			</Select>
			<IconButton size="small" onClick={handlePrev}>
				<Iconify icon="carbon:chevron-left" width={18} />
			</IconButton>
			<IconButton size="small" onClick={handleNext}>
				<Iconify icon="carbon:chevron-right" width={18} />
			</IconButton>
		</Box>
	);
};
