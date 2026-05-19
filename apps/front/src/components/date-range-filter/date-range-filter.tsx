import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useEffect, useId, useState, type MouseEvent } from 'react';

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
		return `${fDate(value.from)} - ${fDate(value.to)}`;
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
	const [draft, setDraft] = useState<DateRange>({ from: null, to: null });
	const popoverId = useId();
	const open = Boolean(anchorEl);

	const effectiveLabel = label ?? t('date');
	const active = activePresetFor(value);
	const rangeText = formatRange(value);

	const handleOpen = (event: MouseEvent<HTMLElement>) => {
		setDraft(value);
		setAnchorEl(event.currentTarget);
	};

	useEffect(() => {
		if (open) {
			setDraft(value);
		}
	}, [open, value, value.from, value.to]);

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelectPreset = (next: DateRange) => {
		setDraft(next);
		onChange(next);
		handleClose();
	};

	// Calendar reports each click. Commit only when both endpoints
	// are set (a complete range). A half-picked range (just `from`,
	// no `to`) stays as local draft so closing the popover doesn't
	// produce a half-committed filter. The popover does NOT close
	// after a complete range is picked - the user closes it
	// explicitly (Escape, click outside, or clicking the trigger).
	const handleCalendarChange = (next: DateRange) => {
		setDraft(next);
		if (next.from !== null && next.to !== null) {
			onChange(next);
		}
	};

	const handleClear = () => {
		setDraft({ from: null, to: null });
		onChange({ from: null, to: null });
	};

	const isActive = value.from !== null || value.to !== null;

	return (
		<>
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					overflow: 'hidden',
					border: '1px solid',
					borderColor: 'divider',
					borderRadius: 1,
				}}
			>
				<Button
					variant="text"
					color="inherit"
					onClick={handleOpen}
					startIcon={<Iconify icon="solar:calendar-date-bold" width={18} />}
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls={open ? popoverId : undefined}
					sx={{
						textTransform: 'none',
						pl: 1.5,
						pr: isActive ? 1 : 1.5,
						gap: 0.5,
						minWidth: 0,
						borderRadius: 0,
						minHeight: 30,
						'&:hover': {
							bgcolor: 'action.hover',
						},
					}}
				>
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						sx={{ overflow: 'hidden' }}
					>
						<Box component="span" sx={{ color: 'text.secondary' }}>
							{effectiveLabel}
						</Box>
						{rangeText && (
							<Box
								component="span"
								sx={{
									px: 0.75,
									py: 0.25,
									borderRadius: 0.75,
									bgcolor: 'action.selected',
									color: 'text.secondary',
									fontWeight: 500,
									fontSize: '0.8125rem',
									whiteSpace: 'nowrap',
								}}
							>
								{rangeText}
							</Box>
						)}
					</Stack>
				</Button>
				{isActive && (
					<Tooltip title={t('clear')}>
						<IconButton
							size="small"
							color="default"
							onClick={handleClear}
							aria-label={t('clear')}
							sx={{
								width: 30,
								height: 30,
								borderLeft: '1px solid',
								borderColor: 'divider',
								borderRadius: 0,
								color: 'text.secondary',
								'&:hover': {
									bgcolor: 'action.hover',
									color: 'text.primary',
								},
							}}
						>
							<Iconify icon="solar:close-circle-bold" width={16} />
						</IconButton>
					</Tooltip>
				)}
			</Box>
			<Popover
				open={open}
				anchorEl={anchorEl}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
				slotProps={{
					paper: {
						id: popoverId,
						sx: {
							width: { xs: 'calc(100vw - 32px)', sm: 'auto' },
							maxWidth: 'calc(100vw - 32px)',
							overflowX: 'hidden',
						},
					},
				}}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', sm: 'row' },
					}}
				>
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
				<Box
					sx={{
						p: 1,
						borderTop: '1px solid',
						borderColor: 'divider',
						display: 'flex',
						justifyContent: 'flex-end',
					}}
				>
					<Button
						size="small"
						color="inherit"
						onClick={handleClear}
						disabled={!isActive}
					>
						{t('clear')}
					</Button>
				</Box>
			</Popover>
		</>
	);
};
