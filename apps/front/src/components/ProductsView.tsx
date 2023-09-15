import { Box, Button, Container, Divider, Stack, Typography } from '@mui/material';

import Iconify from './Iconify';

type Props = {};

const ProductsList = (props: Props) => {
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

						<EcommerceProductList loading={loading} viewMode={viewMode} products={_products.slice(0, 16)} />
					</Box>
				</Stack>
			</Container>
		</>
	);
};

export default ProductsList;
