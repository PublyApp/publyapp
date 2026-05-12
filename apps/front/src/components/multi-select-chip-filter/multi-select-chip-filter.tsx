import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
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

	const handleClearFromTrigger = (event: MouseEvent<HTMLElement>) => {
		event.stopPropagation();
		handleClearAll();
	};

	const isActive = value.length > 0;

	return (
		<>
			<Button
				variant="outlined"
				color="inherit"
				onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
				startIcon={<Iconify icon="ic:round-filter-list" width={18} />}
				endIcon={
					isActive ? (
						<Box
							component="span"
							role="button"
							aria-label="Clear"
							onClick={handleClearFromTrigger}
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								cursor: 'pointer',
								color: 'text.secondary',
								'&:hover': { color: 'text.primary' },
							}}
						>
							<Iconify icon="solar:close-circle-bold" width={18} />
						</Box>
					) : undefined
				}
				sx={{
					textTransform: 'none',
					pl: 1.5,
					pr: isActive ? 1 : 1.5,
					gap: 0.5,
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
