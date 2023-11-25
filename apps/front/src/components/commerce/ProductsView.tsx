import { useState } from 'react';

import {
	Box,
	Button,
	Container,
	Divider,
	FormControl,
	MenuItem,
	Select,
	Stack,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
	type SelectChangeEvent,
} from '@mui/material';

import Iconify from '@devist/ui-react/components/Iconify';

import { _products } from '@front/_mock';
import { NAV } from '@front/lib/constants';

import ProductList from './ProductList';

// type Props = {};

// ----------------------------------------------------------------------

const VIEW_OPTIONS = [
	{ value: 'list', icon: <Iconify icon="carbon:list-boxes" /> },
	{ value: 'grid', icon: <Iconify icon="carbon:grid" /> },
] as const;

type ViewOption = (typeof VIEW_OPTIONS)[number]['value'];

const SORT_OPTIONS = [
	{ value: 'latest', label: 'Latest' },
	{ value: 'oldest', label: 'Oldest' },
	{ value: 'popular', label: 'Popular' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

// ----------------------------------------------------------------------

const ProductsView = (/* props: Props */) => {
	const [viewMode, setViewMode] = useState<ViewOption>('grid');
	const [sort, setSort] = useState<SortOption>('latest');

	const handleChangeViewMode = (_event: React.MouseEvent<HTMLElement>, newAlignment: string | null) => {
		if (newAlignment !== null) {
			setViewMode(newAlignment as ViewOption);
		}
	};

	const handleChangeSort = (event: SelectChangeEvent) => {
		setSort(event.target.value as SortOption);
	};

	const handleMobileOpen = () => {
		// setMobileOpen(true);
	};

	// const handleMobileClose = () => {
	// 	setMobileOpen(false);
	// };

	return (
		<>
			{/* <EcommerceHeader /> */}

			<Container>
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					sx={{
						py: 5,
					}}
				>
					<Typography variant="h3">Catalog</Typography>

					<Button
						color="inherit"
						variant="contained"
						startIcon={<Iconify icon="carbon:filter" width={18} />}
						onClick={handleMobileOpen}
						sx={{
							display: { md: 'none' },
						}}
					>
						Filters
					</Button>
				</Stack>

				<Stack
					direction={{
						xs: 'column-reverse',
						md: 'row',
					}}
					sx={{ mb: { xs: 8, md: 10 } }}
				>
					<Stack spacing={5} divider={<Divider sx={{ borderStyle: 'dashed' }} />}>
						{/* <EcommerceFilters mobileOpen={mobileOpen} onMobileClose={handleMobileClose} /> */}
						{/* <EcommerceProductListBestSellers products={_products.slice(0, 3)} /> */}
					</Stack>

					<Box
						sx={{
							flexGrow: 1,
							pl: { md: 8 },
							width: { md: `calc(100% - ${NAV.W_DRAWER}px)` },
						}}
					>
						<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 5 }}>
							<ToggleButtonGroup
								exclusive
								size="small"
								value={viewMode}
								onChange={handleChangeViewMode}
								sx={{ borderColor: 'transparent' }}
							>
								{VIEW_OPTIONS.map((option) => {
									return (
										<ToggleButton key={option.value} value={option.value}>
											{option.icon}
										</ToggleButton>
									);
								})}
							</ToggleButtonGroup>

							<FormControl size="small" hiddenLabel variant="filled" sx={{ width: 120 }}>
								<Select
									value={sort}
									onChange={handleChangeSort}
									MenuProps={{
										PaperProps: {
											sx: { px: 1 },
										},
									}}
								>
									{SORT_OPTIONS.map((option) => {
										return (
											<MenuItem key={option.value} value={option.value}>
												{option.label}
											</MenuItem>
										);
									})}
								</Select>
							</FormControl>
						</Stack>

						{/* eslint-disable-next-line react/jsx-boolean-value */}
						<ProductList loading={false} viewMode={viewMode} products={_products.slice(0, 16)} />
					</Box>
				</Stack>
			</Container>
		</>
	);
};

export default ProductsView;
