import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import type { PickersCalendarHeaderProps } from '@mui/x-date-pickers/PickersCalendarHeader';

import { Iconify } from '#app/components/iconify/iconify.tsx';

export const DateRangeCalendarHeader = ({
	currentMonth,
	view,
	onViewChange,
	onMonthChange,
}: PickersCalendarHeaderProps) => {
	const handlePrev = () => {
		onMonthChange(currentMonth.subtract(1, 'month'));
	};
	const handleNext = () => {
		onMonthChange(currentMonth.add(1, 'month'));
	};

	const isDayView = view === 'day';

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
			<Button
				size="small"
				color="inherit"
				onClick={() => onViewChange?.('month')}
				sx={{ textTransform: 'none', fontWeight: 500 }}
			>
				{currentMonth.format('MMMM')}
			</Button>
			<Button
				size="small"
				color="inherit"
				onClick={() => onViewChange?.('year')}
				sx={{ textTransform: 'none', fontWeight: 500 }}
			>
				{currentMonth.format('YYYY')}
			</Button>
			<Box sx={{ flexGrow: 1 }} />
			<IconButton size="small" onClick={handlePrev} disabled={!isDayView}>
				<Iconify icon="carbon:chevron-left" width={18} />
			</IconButton>
			<IconButton size="small" onClick={handleNext} disabled={!isDayView}>
				<Iconify icon="carbon:chevron-right" width={18} />
			</IconButton>
		</Box>
	);
};
