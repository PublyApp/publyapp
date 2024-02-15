import { useCallback, useState } from 'react';

import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { type SelectChangeEvent } from '@mui/material/Select';

import CustomPopover from '@devist/ui-react/components/CustomPopover';
import Iconify from '@devist/ui-react/components/Iconify';
import usePopover from '@devist/ui-react/hooks/usePopover';
import type { IProductTableFilters, IProductTableFilterValue } from '@devist/ui-react/types/product';

// ----------------------------------------------------------------------

type Props = {
	filters: IProductTableFilters;
	onFilters: (name: string, value: IProductTableFilterValue) => void;
	//
	stockOptions: {
		value: string;
		label: string;
	}[];
	publishOptions: {
		value: string;
		label: string;
	}[];
};

const ProductTableToolbar = ({
	filters,
	onFilters,
	//
	stockOptions,
	publishOptions,
}: Props) => {
	const popover = usePopover();

	const [stock, setStock] = useState<string[]>(filters.stock);

	const [publish, setPublish] = useState<string[]>(filters.publish);

	const handleChangeStock = useCallback((event: SelectChangeEvent<string[]>) => {
		const {
			target: { value },
		} = event;
		setStock(typeof value === 'string' ? value.split(',') : value);
	}, []);

	const handleChangePublish = useCallback((event: SelectChangeEvent<string[]>) => {
		const {
			target: { value },
		} = event;
		setPublish(typeof value === 'string' ? value.split(',') : value);
	}, []);

	const handleCloseStock = useCallback(() => {
		onFilters('stock', stock);
	}, [onFilters, stock]);

	const handleClosePublish = useCallback(() => {
		onFilters('publish', publish);
	}, [onFilters, publish]);

	return (
		<>
			<FormControl
				sx={{
					flexShrink: 0,
					width: { xs: 1, md: 200 },
				}}
			>
				<InputLabel>Stock</InputLabel>

				<Select
					multiple
					value={stock}
					onChange={handleChangeStock}
					input={<OutlinedInput label="Stock" />}
					renderValue={(selected) => {
						return selected
							.map((value) => {
								return value;
							})
							.join(', ');
					}}
					onClose={handleCloseStock}
					sx={{ textTransform: 'capitalize' }}
				>
					{stockOptions.map((option) => {
						return (
							<MenuItem key={option.value} value={option.value}>
								<Checkbox disableRipple size="small" checked={stock.includes(option.value)} />
								{option.label}
							</MenuItem>
						);
					})}
				</Select>
			</FormControl>

			<FormControl
				sx={{
					flexShrink: 0,
					width: { xs: 1, md: 200 },
				}}
			>
				<InputLabel>Publish</InputLabel>

				<Select
					multiple
					value={publish}
					onChange={handleChangePublish}
					input={<OutlinedInput label="Publish" />}
					renderValue={(selected) => {
						return selected
							.map((value) => {
								return value;
							})
							.join(', ');
					}}
					onClose={handleClosePublish}
					sx={{ textTransform: 'capitalize' }}
				>
					{publishOptions.map((option) => {
						return (
							<MenuItem key={option.value} value={option.value}>
								<Checkbox disableRipple size="small" checked={publish.includes(option.value)} />
								{option.label}
							</MenuItem>
						);
					})}
				</Select>
			</FormControl>

			<CustomPopover open={popover.open} onClose={popover.onClose} arrow="right-top" sx={{ width: 140 }}>
				<MenuItem
					onClick={() => {
						popover.onClose();
					}}
				>
					<Iconify icon="solar:printer-minimalistic-bold" />
					Print
				</MenuItem>

				<MenuItem
					onClick={() => {
						popover.onClose();
					}}
				>
					<Iconify icon="solar:import-bold" />
					Import
				</MenuItem>

				<MenuItem
					onClick={() => {
						popover.onClose();
					}}
				>
					<Iconify icon="solar:export-bold" />
					Export
				</MenuItem>
			</CustomPopover>
		</>
	);
};

export default ProductTableToolbar;
