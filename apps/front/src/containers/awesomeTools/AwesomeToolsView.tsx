'use client';

import { Box, Button, Container, Divider, Stack, Typography } from '@mui/material';

import Iconify from '@devist/ui-react/components/Iconify';
import useFakeLoading from '@devist/ui-react/hooks/useFakeLoading';

import { _jobs } from '@front/_mock';
import MainLayout from '@front/layouts/main/MainLayout';
import { NAV } from '@front/lib/constants';

import AwesomeToolsList from './AwesomeToolsList';

//
// import NewsletterCareer from '../../newsletter/career';
// import CareerFilters from '../job/filters';
// import { AwesomeToolsList } from '../job/list';

// ----------------------------------------------------------------------

const AwesomeToolsView = () => {
	const loading = useFakeLoading();

	const handleMobileOpen = () => {
		// setMobileOpen(true);
	};

	return (
		<MainLayout>
			<Container>
				{/* <CareerFilters /> */}
				{/* <Typography variant="h1">Hello</Typography> */}

				{/* <AwesomeToolsList jobs={_jobs} loading={loading} /> */}

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
						{/* <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 5 }}>
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
						</Stack> */}

						{/* eslint-disable-next-line react/jsx-boolean-value */}
						{/* <ProductList loading={false} viewMode={viewMode} products={_products.slice(0, 16)} /> */}
						<AwesomeToolsList jobs={_jobs} loading={loading} />
					</Box>
				</Stack>
			</Container>

			{/* <NewsletterCareer /> */}
		</MainLayout>
	);
};

export default AwesomeToolsView;
