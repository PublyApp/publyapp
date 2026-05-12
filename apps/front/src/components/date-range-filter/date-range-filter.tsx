import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import { useState, type MouseEvent } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { fDate } from '#app/utils/format-time.ts';

import { DateRangeFilterCalendar } from './date-range-filter-calendar';
import {
	activePresetFor,
	DateRangeFilterPresets,
} from './date-range-filter-presets';
import type {
	DateRange,
	DateRangeFilterProps,
} from './date-range-filter.types';

const formatRange = (value: DateRange): string => {
	if (value.from && value.to) {
		return `${fDate(value.from)} – ${fDate(value.to)}`;
	}
	if (value.from) {
		return fDate(value.from);
	}
	if (value.to) {
		return fDate(value.to);
	}
	return '';
};

export const DateRangeFilter = ({
	label,
	value,
	onChange,
	minDate,
	maxDate,
}: DateRangeFilterProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [draft, setDraft] = useState<DateRange>(value);
	const open = Boolean(anchorEl);

	const effectiveLabel = label ?? t('date');
	const active = activePresetFor(value);

	const triggerText = (() => {
		const range = formatRange(value);
		return range ? `${effectiveLabel} · ${range}` : effectiveLabel;
	})();

	const handleOpen = (event: MouseEvent<HTMLElement>) => {
		setDraft(value);
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelectPreset = (next: DateRange) => {
		onChange(next);
		handleClose();
	};

	// Calendar reports each click. Commit only when both endpoints
	// are set (a complete range). A half-picked range (just `from`,
	// no `to`) stays as local draft so closing the popover doesn't
	// produce a half-committed filter.
	const handleCalendarChange = (next: DateRange) => {
		setDraft(next);
		if (next.from !== null && next.to !== null) {
			onChange(next);
			handleClose();
		}
	};

	const handleClear = () => {
		setDraft({ from: null, to: null });
		onChange({ from: null, to: null });
		handleClose();
	};

	const isActive = value.from !== null || value.to !== null;

	return (
		<>
			<Button
				variant="outlined"
				color="inherit"
				onClick={handleOpen}
				endIcon={<Iconify icon="eva:chevron-down-fill" width={18} />}
				sx={{ textTransform: 'none' }}
			>
				{triggerText}
			</Button>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			>
				<Box sx={{ display: 'flex' }}>
					<DateRangeFilterPresets
						active={active}
						onSelectPreset={handleSelectPreset}
					/>
					<DateRangeFilterCalendar
						value={draft}
						onChange={handleCalendarChange}
						minDate={minDate}
						maxDate={maxDate}
					/>
				</Box>
				{isActive && (
					<Box
						sx={{
							p: 1,
							borderTop: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							justifyContent: 'flex-end',
						}}
					>
						<Button size="small" color="inherit" onClick={handleClear}>
							{t('clear')}
						</Button>
					</Box>
				)}
			</Popover>
		</>
	);
};
