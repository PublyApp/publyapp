import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
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
	const [mode, setMode] = useState<'presets' | 'custom'>('presets');
	const [draft, setDraft] = useState<DateRange>(value);
	const open = Boolean(anchorEl);

	const effectiveLabel = label ?? t('date');
	const active = activePresetFor(value);

	const triggerText = (() => {
		const range = formatRange(value);
		return range ? `${effectiveLabel} · ${range}` : effectiveLabel;
	})();

	const handleOpen = (event: MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
		setMode(
			active === 'custom' && (value.from || value.to) ? 'custom' : 'presets',
		);
		setDraft(value);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelectPreset = (next: DateRange) => {
		onChange(next);
		handleClose();
	};

	const handleApplyCustom = () => {
		onChange(draft);
		handleClose();
	};

	const handleCancelCustom = () => {
		setDraft(value);
		setMode('presets');
	};

	const handleClear = () => {
		onChange({ from: null, to: null });
		handleClose();
	};

	const isActive = value.from !== null || value.to !== null;

	return (
		<>
			<Button
				size="small"
				variant="outlined"
				color="inherit"
				onClick={handleOpen}
				endIcon={<Iconify icon="eva:chevron-down-fill" width={16} />}
				sx={{ borderRadius: 999, textTransform: 'none' }}
			>
				{triggerText}
			</Button>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'left',
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'left',
				}}
			>
				<Box sx={{ display: 'flex' }}>
					<DateRangeFilterPresets
						active={active}
						onSelectPreset={handleSelectPreset}
						onSelectCustom={() => setMode('custom')}
					/>
					{mode === 'custom' && (
						<Box>
							<DateRangeFilterCalendar
								value={draft}
								onChange={setDraft}
								minDate={minDate}
								maxDate={maxDate}
							/>
							<Stack
								direction="row"
								spacing={1}
								sx={{
									p: 1,
									justifyContent: 'flex-end',
								}}
							>
								<Button
									size="small"
									color="inherit"
									onClick={handleCancelCustom}
								>
									{t('cancel')}
								</Button>
								<Button
									size="small"
									variant="contained"
									onClick={handleApplyCustom}
								>
									{t('apply')}
								</Button>
							</Stack>
						</Box>
					)}
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
