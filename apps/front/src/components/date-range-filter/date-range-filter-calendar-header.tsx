import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { PickersCalendarHeaderProps } from '@mui/x-date-pickers/PickersCalendarHeader';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

export const DateRangeCalendarHeader = ({
	currentMonth,
	view,
	onViewChange,
	onMonthChange,
}: PickersCalendarHeaderProps) => {
	const { t } = useTranslate();

	const handlePrev = () => {
		onMonthChange(currentMonth.subtract(1, 'month'));
	};
	const handleNext = () => {
		onMonthChange(currentMonth.add(1, 'month'));
	};
	const handleExit = () => {
		onViewChange?.('day');
	};

	const isDayView = view === 'day';

	if (!isDayView) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					px: 1,
					py: 0.5,
				}}
			>
				<Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}>
					{view === 'year'
						? currentMonth.format('YYYY')
						: currentMonth.format('MMMM YYYY')}
				</Box>
				<Tooltip title={t('cancel')} placement="top" arrow>
					<IconButton size="small" onClick={handleExit}>
						<Iconify icon="carbon:close" width={18} />
					</IconButton>
				</Tooltip>
			</Box>
		);
	}

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
				variant="text"
				color="inherit"
				onClick={() => onViewChange?.('month')}
				sx={{
					textTransform: 'none',
					bgcolor: 'action.hover',
					color: 'text.secondary',
					'&:hover': { bgcolor: 'action.selected' },
				}}
			>
				{currentMonth.format('MMMM')}
			</Button>
			<Button
				size="small"
				variant="text"
				color="inherit"
				onClick={() => onViewChange?.('year')}
				sx={{
					textTransform: 'none',
					bgcolor: 'action.hover',
					color: 'text.secondary',
					'&:hover': { bgcolor: 'action.selected' },
				}}
			>
				{currentMonth.format('YYYY')}
			</Button>
			<Box sx={{ flexGrow: 1 }} />
			<IconButton size="small" onClick={handlePrev}>
				<Iconify icon="carbon:chevron-left" width={18} />
			</IconButton>
			<IconButton size="small" onClick={handleNext}>
				<Iconify icon="carbon:chevron-right" width={18} />
			</IconButton>
		</Box>
	);
};
