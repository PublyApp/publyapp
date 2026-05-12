import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import filter from 'lodash/filter';
import { useState, type MouseEvent } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';

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
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
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

	return (
		<>
			<Button
				size="small"
				variant="outlined"
				color="inherit"
				onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
				endIcon={<Iconify icon="eva:chevron-down-fill" width={16} />}
				sx={{ borderRadius: 999, textTransform: 'none' }}
			>
				{label}
				{value.length > 0 && (
					<Badge color="primary" badgeContent={value.length} sx={{ ml: 1.5 }} />
				)}
			</Button>
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
