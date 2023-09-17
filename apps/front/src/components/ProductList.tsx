import { Box, Pagination, Stack } from '@mui/material';

import { ProductViewGridItem } from './ProductViewGridItem';
import { ProductViewGridItemSkeleton } from './ProductViewGridItemSkeleton';
import { ProductViewListItem } from './ProductViewListItem';
import { ProductViewListItemSkeleton } from './ProductViewListItemSkeleton';

export type IProductItemProps = {
	id: string;
	name: string;
	label: string;
	caption: string;
	description: string;
	coverImg: string;
	category: string;
	sold: number;
	price: number;
	rating: number;
	priceSale: number;
	inStock: number;
	review: number;
	images: string[];
};

type Props = {
	products: IProductItemProps[];
	viewMode: string;
	loading?: boolean;
};

const ProductList = ({ products, viewMode, loading }: Props) => {
	return (
		<>
			{viewMode === 'grid' ? (
				<Box
					rowGap={4}
					columnGap={3}
					display="grid"
					gridTemplateColumns={{ xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }}
				>
					{(loading ? [...Array(16)] : products).map((product, index) => {
						return product ? (
							<ProductViewGridItem key={product.id} product={product} />
						) : (
							// eslint-disable-next-line react/no-array-index-key
							<ProductViewGridItemSkeleton key={index} />
						);
					})}
				</Box>
			) : (
				<Stack spacing={4}>
					{(loading ? [...Array(16)] : products).map((product, index) => {
						return product ? (
							<ProductViewListItem key={product.id} product={product} />
						) : (
							// eslint-disable-next-line react/no-array-index-key
							<ProductViewListItemSkeleton key={index} />
						);
					})}
				</Stack>
			)}

			<Pagination
				count={10}
				color="primary"
				size="large"
				sx={{
					mt: 10,
					mb: 5,
					'& .MuiPagination-ul': {
						justifyContent: 'center',
					},
				}}
			/>
		</>
	);
};

export default ProductList;
