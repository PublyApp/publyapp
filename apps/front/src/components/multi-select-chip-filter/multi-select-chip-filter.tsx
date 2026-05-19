import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import filter from 'lodash/filter';
import { useId, useState, type MouseEvent } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { MultiSelectChipFilterList } from './multi-select-chip-filter-list';
import { MultiSelectChipFilterSelected } from './multi-select-chip-filter-selected';
import type { MultiSelectChipFilterProps } from './multi-select-chip-filter.types';

export const MultiSelectChipFilter = ({
	label,
	options,
	value,
	onChange,
	loading,
	searchPlaceholder,
	emptyLabel,
	groupOrder,
}: MultiSelectChipFilterProps) => {
	const { t } = useTranslate();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const popoverId = useId();
	const open = Boolean(anchorEl);

	const handleToggle = (val: string) => {
		if (value.includes(val)) {
			onChange(filter(value, (v) => v !== val));
		} else {
			onChange([...value, val]);
		}
	};

	const handleRemove = (val: string) => {
		onChange(filter(value, (v) => v !== val));
	};

	const handleClearAll = () => {
		onChange([]);
	};

	const isActive = value.length > 0;

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
					onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
					startIcon={<Iconify icon="solar:filter-bold" width={18} />}
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls={open ? popoverId : undefined}
					sx={{
						textTransform: 'none',
						pl: 1.5,
						pr: isActive ? 1 : 1.5,
						gap: 0.5,
						borderRadius: 0,
						minHeight: 30,
						'&:hover': {
							bgcolor: 'action.hover',
						},
					}}
				>
					<Stack direction="row" spacing={1} alignItems="center">
						<Box component="span" sx={{ color: 'text.secondary' }}>
							{label}
						</Box>
						{isActive && (
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
									minWidth: 20,
									textAlign: 'center',
								}}
							>
								{value.length}
							</Box>
						)}
					</Stack>
				</Button>
				{isActive && (
					<Tooltip title={t('clear')}>
						<IconButton
							size="small"
							color="default"
							onClick={handleClearAll}
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
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'left',
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'left',
				}}
				slotProps={{
					paper: {
						id: popoverId,
					},
				}}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: {
							xs: 'column-reverse',
							sm: 'row',
						},
					}}
				>
					<MultiSelectChipFilterList
						options={options}
						selected={value}
						onToggle={handleToggle}
						loading={loading}
						searchPlaceholder={searchPlaceholder}
						emptyLabel={emptyLabel}
						groupOrder={groupOrder}
					/>
					<MultiSelectChipFilterSelected
						options={options}
						selected={value}
						onRemove={handleRemove}
						onClearAll={handleClearAll}
					/>
				</Box>
			</Popover>
		</>
	);
};
